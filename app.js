(() => {
  'use strict';

  // Nothing personal lives in this file. All text and photos arrive encrypted (vault.json, p/*.bin)
  // and are only decrypted in the browser after the right password is typed.

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const MUSIC = 'assets/music.mp3';

  let C = {};        // decrypted config
  let photos = [];   // decrypted photo list
  let KEY = null;    // AES key derived from the password

  /* ---------------- Crypto ---------------- */

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, kdf) {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: kdf.hash || 'SHA-256', salt: fromB64(kdf.salt), iterations: kdf.iterations },
      base, 256
    );
    return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  }

  async function unseal(key, bytes) {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)
    );
    return new Uint8Array(plain);
  }

  let vaultPromise = null;
  function getVault() {
    if (!vaultPromise) {
      vaultPromise = fetch('vault.json', { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(`vault ${r.status}`); return r.json(); })
        .catch((e) => { vaultPromise = null; throw e; });
    }
    return vaultPromise;
  }
  getVault().catch(() => { /* retried on submit */ });

  const urlCache = new Map();
  function photoUrl(p, size) {
    const src = size === 'full' ? p.f : p.t;
    if (!urlCache.has(src)) {
      const job = fetch(src)
        .then((r) => { if (!r.ok) throw new Error(`photo ${r.status}`); return r.arrayBuffer(); })
        .then((buf) => unseal(KEY, new Uint8Array(buf)))
        .then((plain) => URL.createObjectURL(new Blob([plain], { type: p.type || 'image/webp' })))
        .catch((e) => { urlCache.delete(src); throw e; });
      urlCache.set(src, job);
    }
    return urlCache.get(src);
  }

  /* ---------------- Diya markup ---------------- */

  function diya(extra = '') {
    return `<span class="diya ${extra}" aria-hidden="true">
      <span class="diya-glow"></span>
      <svg class="diya-svg" viewBox="0 0 120 100" focusable="false">
        <ellipse cx="60" cy="60" rx="50" ry="8.5" fill="url(#g-oil)"/>
        <path d="M60 52v8" stroke="#2B150C" stroke-width="2.4" stroke-linecap="round"/>
        <g class="flame">
          <path d="M60 6C66 20 75 32 72 44C70 53 64 57.5 60 57.5C56 57.5 50 53 48 44C45 32 54 20 60 6Z" fill="url(#g-flame)"/>
          <path d="M60 27C64 35 67 41 65.5 47C64.5 52 62.5 55 60 55C57.5 55 55.5 52 54.5 47C53 41 56 35 60 27Z" fill="url(#g-core)"/>
        </g>
        <path d="M9 60C14 84 38 94 60 94C82 94 106 84 111 60C100 66 80 69 60 69C40 69 20 66 9 60Z" fill="url(#g-clay)"/>
        <path d="M9 60C20 66 40 69 60 69C80 69 100 66 111 60" fill="none" stroke="#E39A5E" stroke-width="1.6" opacity=".75"/>
        <g fill="#F2A33A">
          <circle cx="34" cy="80" r="2.2"/><circle cx="47" cy="83.6" r="2.2"/><circle cx="60" cy="84.6" r="2.4"/>
          <circle cx="73" cy="83.6" r="2.2"/><circle cx="86" cy="80" r="2.2"/>
        </g>
      </svg>
    </span>`;
  }

  /* ---------------- Dates ---------------- */

  function parseDate(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }
  const addYears = (d, n) => new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
  const monthYear = (d) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const fullDate = (iso) => {
    const d = parseDate(iso);
    return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  };

  /* ---------------- Music ---------------- */

  const musicBtn = $('#music-btn');
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'none';
  let musicAvailable = false;
  const musicCheck = fetch(MUSIC, { method: 'HEAD' })
    .then((r) => { musicAvailable = r.ok; })
    .catch(() => { musicAvailable = false; });

  function setMusicUI(playing) {
    musicBtn.setAttribute('aria-pressed', String(playing));
    musicBtn.setAttribute('aria-label', playing ? 'Gaana band karo' : 'Gaana chalao');
  }
  audio.addEventListener('play', () => setMusicUI(true));
  audio.addEventListener('pause', () => setMusicUI(false));
  audio.addEventListener('error', () => { musicBtn.hidden = true; });

  // Called inside the tap, before the password check finishes, so phones allow the song to start.
  function primeMusic() {
    if (!audio.src) audio.src = MUSIC;
    audio.muted = true;
    const p = audio.play();
    if (p) p.catch(() => {});
  }
  function unprimeMusic() {
    audio.pause();
    audio.muted = false;
  }
  function startMusic() {
    audio.currentTime = 0;
    audio.muted = false;
    if (audio.paused) audio.play().catch(() => {});
  }

  musicBtn.addEventListener('click', () => {
    if (audio.paused) { if (!audio.src) audio.src = MUSIC; audio.muted = false; audio.play().catch(() => {}); }
    else audio.pause();
  });

  /* ---------------- Gate ---------------- */

  const gate = $('#gate');
  const main = $('main');
  const form = $('#gate-form');
  const input = $('#gate-input');
  const submitBtn = $('#gate-submit');
  const err = $('#gate-error');
  $('#gate-diya').innerHTML = diya();
  const gateDiya = $('#gate-diya .diya');
  let busy = false;
  let opened = false;

  function fail(message) {
    err.textContent = message;
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.select();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || opened) return;
    const pw = input.value.trim();
    if (!pw) return;

    busy = true;
    err.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Diya jal raha hai…';
    primeMusic();

    try {
      let vault;
      try { vault = await getVault(); } catch (x) { throw Object.assign(x, { kind: 'net' }); }
      const key = await deriveKey(pw, vault.kdf);
      let plain;
      try { plain = await unseal(key, fromB64(vault.data)); } catch (x) { throw Object.assign(new Error('wrong'), { kind: 'pw' }); }
      const data = JSON.parse(new TextDecoder().decode(plain));
      KEY = key;
      C = data.config || {};
      photos = Array.isArray(data.photos) ? data.photos : [];
      render();
      openSite();
    } catch (x) {
      unprimeMusic();
      fail(x.kind === 'pw'
        ? 'Yeh password nahi hai. Ek baar aur try karo.'
        : 'Page load nahi hua. Internet check karke dobara try karo.');
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Diya jalao';
    }
  });

  setTimeout(() => input.focus(), 300);

  async function openSite() {
    opened = true;
    startMusic();
    input.blur();
    gateDiya.classList.add('lit');
    await wait(1100);

    main.hidden = false;
    document.body.classList.remove('locked');
    gate.classList.add('opening');
    setTimeout(() => { gate.hidden = true; }, 1600);

    musicCheck.then(() => {
      if (musicAvailable) musicBtn.hidden = false;
      else audio.pause();
    });

    startCounter();
    observeStory();
    $('#hero-name').focus({ preventScroll: true });

    await wait(900);
    for (const d of $$('#hero-diyas .diya')) {
      d.classList.add('lit');
      await wait(480);
    }
    await wait(200);
    $('.hero').classList.add('glowing');
  }

  /* ---------------- Render decrypted content ---------------- */

  function render() {
    const since = parseDate(C.togetherSince);

    if (C.herName) document.title = `Paanch saal, ${C.herName} ❤️`;
    $$('[data-c]').forEach((el) => {
      const v = C[el.dataset.c];
      if (v) el.textContent = v;
    });

    $('#hero-diyas').innerHTML = [1, 2, 3, 4, 5]
      .map((n) => `<li>${diya()}<span>Saal ${n}</span></li>`).join('');

    $('#story-list').innerHTML = (C.years || []).map((y, i) => {
      const when = since
        ? `<span class="story-when">${monthYear(addYears(since, i))} se ${monthYear(addYears(since, i + 1))}</span>`
        : '';
      return `<li class="story-item">
        ${diya('story-diya')}
        <div>
          <p class="story-year">Saal ${i + 1}${when}</p>
          <h3>${esc(y.title)}</h3>
          <p class="story-text">${esc(y.text)}</p>
        </div>
      </li>`;
    }).join('');

    const L = C.letter || {};
    $('#letter-body').innerHTML = [
      L.greeting ? `<p class="greet">${esc(L.greeting)}</p>` : '',
      ...(L.paragraphs || []).map((p) => `<p>${esc(p)}</p>`),
      C.signature ? `<p class="sign">${esc(C.signature)}</p>` : ''
    ].join('');

    $('#promise-list').innerHTML = (C.promises || []).map((p, i) => `
      <li>
        <button class="promise" type="button" aria-expanded="false">
          ${diya()}
          <span>
            <span class="promise-label">Saal ${i + 6}</span>
            <span class="promise-hint">Tap karke diya jalao</span>
            <span class="promise-text"><span>${esc(p)}</span></span>
          </span>
        </button>
      </li>`).join('');
    $$('.promise').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-expanded') === 'true') return;
        btn.setAttribute('aria-expanded', 'true');
        $('.diya', btn).classList.add('lit');
      });
    });

    renderAlbum();
  }

  /* ---------------- Counter ---------------- */

  function startCounter() {
    const el = $('#counter');
    const since = parseDate(C.togetherSince);
    if (!since) {
      el.textContent = 'Paanch saal ho gaye, aur har din pehle se zyada pyaar.';
      return;
    }
    const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
    const tick = () => {
      let s = Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000));
      const days = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60);
      const sec = s % 60;
      el.innerHTML =
        `Hum saath hain <strong>${plural(days, 'din', 'din')}</strong>, ` +
        `<strong>${plural(h, 'ghanta', 'ghante')}</strong>, ` +
        `<strong>${plural(m, 'minute', 'minute')}</strong> aur ` +
        `<strong>${plural(sec, 'second', 'second')}</strong> se.`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- Story diyas light as you reach each year ---------------- */

  function observeStory() {
    const ds = $$('.story-diya');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      ds.forEach((d) => d.classList.add('lit'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('lit');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -30% 0px', threshold: 0.6 });
    ds.forEach((d) => io.observe(d));
  }

  /* ---------------- Album ---------------- */

  function renderAlbum() {
    if (!photos.length) {
      $('#album-empty').hidden = false;
      return;
    }

    const groups = new Map();
    photos.forEach((p, i) => {
      p.i = i;
      const key = p.date ? p.date.slice(0, 4) : 'more';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    if (groups.has('more')) {
      const more = groups.get('more');
      groups.delete('more');
      groups.set('more', more);
    }

    const html = [];
    for (const [key, list] of groups) {
      const label = key === 'more' ? 'Aur bhi yaadein' : key;
      const count = `${list.length} ${list.length === 1 ? 'yaad' : 'yaadein'}`;
      html.push(`<section class="year-group" aria-label="${esc(label)}">
        <div class="year-head"><h3>${esc(label)}</h3><span>${count}</span></div>
        <div class="grid">
          ${list.map((p) => {
            const ratio = p.w && p.h ? ` style="aspect-ratio:${p.w}/${p.h}"` : ' style="aspect-ratio:3/4"';
            const cap = p.caption ? `<span class="photo-cap">${esc(p.caption)}</span>` : '';
            const label = p.caption || (p.date ? fullDate(p.date) : 'Hamari ek yaad');
            return `<button class="photo" type="button" data-i="${p.i}" aria-label="${esc(label)}, photo kholo">
              <img alt="${esc(p.caption || '')}" data-i="${p.i}"${ratio}>${cap}
            </button>`;
          }).join('')}
        </div>
      </section>`);
    }
    const root = $('#album-groups');
    root.innerHTML = html.join('');
    $('#album-play').hidden = false;

    const show = (img) => {
      photoUrl(photos[+img.dataset.i], 'thumb')
        .then((u) => { img.src = u; img.classList.add('ready'); })
        .catch(() => img.classList.add('failed'));
    };
    const imgs = $$('img[data-i]', root);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { io.unobserve(en.target); show(en.target); }
        });
      }, { rootMargin: '600px 0px' });
      imgs.forEach((img) => io.observe(img));
    } else {
      imgs.forEach(show);
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('.photo');
      if (b) openLightbox(+b.dataset.i);
    });
    $('#album-play').addEventListener('click', () => {
      openLightbox(0);
      startShow();
    });
  }

  /* ---------------- Lightbox ---------------- */

  const lb = {
    el: $('#lightbox'), img: $('#lb-img'), cap: $('#lb-cap'), meta: $('#lb-meta'),
    count: $('#lb-count'), play: $('#lb-play'), close: $('#lb-close'),
    i: 0, token: 0, timer: null, lastFocus: null
  };

  function openLightbox(i) {
    lb.lastFocus = document.activeElement;
    lb.el.hidden = false;
    document.body.classList.add('lb-open');
    showPhoto(i);
    lb.close.focus();
  }

  function closeLightbox() {
    stopShow();
    lb.el.hidden = true;
    document.body.classList.remove('lb-open');
    if (lb.lastFocus && lb.lastFocus.focus) lb.lastFocus.focus();
  }

  function showPhoto(i) {
    if (!photos.length) return;
    i = (i + photos.length) % photos.length;
    lb.i = i;
    const p = photos[i];
    const token = ++lb.token;
    lb.img.classList.add('swap');
    const put = (u) => {
      if (token !== lb.token) return;
      lb.img.src = u;
      lb.img.alt = p.caption || (p.date ? `Photo, ${fullDate(p.date)}` : 'Hamari ek yaad');
      lb.img.classList.remove('swap');
    };
    photoUrl(p, 'full').then(put).catch(() => photoUrl(p, 'thumb').then(put).catch(() => {}));
    lb.cap.textContent = p.caption || '';
    lb.meta.textContent = p.date ? fullDate(p.date) : '';
    lb.count.textContent = `${i + 1} / ${photos.length}`;
    [i + 1, i - 1].forEach((j) => {
      const q = photos[(j + photos.length) % photos.length];
      if (q) photoUrl(q, 'full').catch(() => {});
    });
  }

  const next = () => showPhoto(lb.i + 1);
  const prev = () => showPhoto(lb.i - 1);

  function startShow() {
    stopShow();
    lb.play.setAttribute('aria-pressed', 'true');
    lb.play.textContent = 'Slideshow roko';
    lb.timer = setInterval(next, 4500);
  }
  function stopShow() {
    clearInterval(lb.timer);
    lb.timer = null;
    lb.play.setAttribute('aria-pressed', 'false');
    lb.play.textContent = 'Slideshow chalao';
  }
  const restartShowIfRunning = () => { if (lb.timer) startShow(); };

  lb.close.addEventListener('click', closeLightbox);
  $('#lb-next').addEventListener('click', () => { next(); restartShowIfRunning(); });
  $('#lb-prev').addEventListener('click', () => { prev(); restartShowIfRunning(); });
  lb.play.addEventListener('click', () => (lb.timer ? stopShow() : startShow()));
  lb.el.addEventListener('click', (e) => { if (e.target === lb.el) closeLightbox(); });

  document.addEventListener('keydown', (e) => {
    if (lb.el.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
    else if (e.key === 'ArrowRight') { next(); restartShowIfRunning(); }
    else if (e.key === 'ArrowLeft') { prev(); restartShowIfRunning(); }
    else if (e.key === 'Tab') {
      const f = $$('button', lb.el).filter((b) => b.offsetParent !== null);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  let touchX = null, touchY = null;
  lb.el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchX = t.clientX; touchY = t.clientY;
  }, { passive: true });
  lb.el.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX, dy = t.clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      (dx < 0 ? next : prev)();
      restartShowIfRunning();
    }
  }, { passive: true });

  /* ---------------- Wish & lanterns ---------------- */

  const wishBtn = $('#wish-btn');
  wishBtn.addEventListener('click', () => {
    $('#finale').classList.add('wished');
    releaseLanterns();
    wishBtn.textContent = 'Ek aur wish maango';
  });

  function releaseLanterns() {
    if (reduceMotion) return;
    const sky = $('#sky');
    for (let i = 0; i < 5; i++) {
      const l = document.createElement('span');
      l.className = 'lantern';
      const w = i === 2 ? 66 : 34 + Math.random() * 20;
      l.style.setProperty('--w', `${w}px`);
      l.style.setProperty('--dur', `${9 + Math.random() * 4}s`);
      l.style.setProperty('--sway', `${Math.round(Math.random() * 70 - 35)}px`);
      l.style.left = `${12 + i * 19 + (Math.random() * 8 - 4)}%`;
      l.style.animationDelay = `${i === 2 ? 0 : 0.3 + Math.random() * 1.4}s`;
      l.addEventListener('animationend', () => l.remove());
      sky.appendChild(l);
    }
  }
})();
