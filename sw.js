/* Options BD Tracker — Service Worker
   লক্ষ্য:
   ১. নেট না থাকলেও App খুলবে (শেষবার নামানো সংস্করণ ক্যাশ থেকে)।
   ২. নেট থাকলে সবসময় সর্বশেষ সংস্করণ — একবার Reload-ই যথেষ্ট।
   লিডের ডেটা এখানে থাকে না; সেটা ফোনের localStorage-এ, আর Sheet-সিঙ্ক App নিজেই করে। */
const CACHE = 'obd-v6';
const ASSETS = ['./', './index.html', './manifest.json'];
const NET_TIMEOUT_MS = 5000;   // দুর্বল নেটে ৫ সেকেন্ডের বেশি অপেক্ষা নয় — তখন ক্যাশ থেকে খোলে

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ক্যাশে খোঁজা; পাতা খুঁজলে index.html দিয়েও চলবে */
function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return caches.match('./index.html').then(h => h || caches.match('./'));
    }
    return undefined;
  });
}

/* আগে নেট, না পেলে (বা ধীর হলে) ক্যাশ */
function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };

    const timer = setTimeout(() => { fromCache(req).then(finish); }, NET_TIMEOUT_MS);

    fetch(req).then(resp => {
      clearTimeout(timer);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      if (done) return;
      done = true;
      resolve(resp);
    }).catch(() => {
      clearTimeout(timer);
      fromCache(req).then(hit => {
        if (done) return;
        done = true;
        resolve(hit || Response.error());
      });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Google Sheet সিঙ্ক — কখনো ক্যাশ নয় */
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('script.googleusercontent.com') !== -1) {
    return;
  }

  /* App-এর নিজের ফাইল: আগে নেট, অফলাইনে ক্যাশ */
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
    return;
  }

  /* বাইরের ফাইল (বাংলা ফন্ট): নেট, না পেলে ক্যাশ */
  e.respondWith(
    fetch(req).then(resp => {
      if (resp && (resp.status === 200 || resp.type === 'opaque')) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return resp;
    }).catch(() => caches.match(req))
  );
});
