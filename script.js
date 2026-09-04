document.addEventListener('DOMContentLoaded', () => {
  initSafetyNet();
  initPreloader();
  initHeader();
  initDrawer();
  initAccordion();
  initSeasideGallery();
  initLightbox();
  initReveal();
  initForm();
  initTheme();
  initDiagonalCuts();
  initPhToggle();
});

function initTheme() {
  const root = document.documentElement;
  const buttons = [document.getElementById('themeBtn'), document.getElementById('themeBtnDrawer')].filter(Boolean);

  let saved = null;
  try {
    saved = localStorage.getItem('atmos-theme');
  } catch (e) {
    saved = null;
  }

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let dark = saved ? saved === 'dark' : systemDark;

  const apply = () => {
    if (dark) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#17171A' : '#FAF7F2');
    buttons.forEach(btn => {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('title', dark ? 'Светлая тема' : 'Тёмная тема');
      const label = btn.querySelector('.theme-btn__label');
      if (label) label.textContent = dark ? 'Светлая тема' : 'Тёмная тема';
    });
  };

  apply();

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      dark = !dark;
      apply();
      try {
        localStorage.setItem('atmos-theme', dark ? 'dark' : 'light');
      } catch (e) {}
    });
  });
}

function initDiagonalCuts() {
  const sections = Array.from(document.querySelectorAll('.section--dark'));
  if (!sections.length) return;

  const pick = () => 26 + Math.round(Math.random() * 30);

  sections.forEach(section => {
    const topSlope = pick();
    const topRight = Math.random() < 0.5;
    section.style.setProperty('--ctl', (topRight ? 0 : topSlope) + 'px');
    section.style.setProperty('--ctr', (topRight ? topSlope : 0) + 'px');

    if (section.id === 'process') {
      const bottomSlope = pick();
      const bottomRight = Math.random() < 0.5;
      section.style.setProperty('--cbl', (bottomRight ? 0 : bottomSlope) + 'px');
      section.style.setProperty('--cbr', (bottomRight ? bottomSlope : 0) + 'px');
    }
  });
}

function initSafetyNet() {
  const root = document.documentElement;
  if ('IntersectionObserver' in window) {
    root.classList.add('anim-on');
  }

  const showEverything = () => {
    document.body.classList.remove('is-preloading');
    document.body.classList.add('is-ready');
    const preloader = document.getElementById('preloader');
    if (preloader) preloader.classList.add('is-hidden');
    root.classList.remove('anim-on');
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-in'));
  };

  const rescue = () => {
    if (!document.body.classList.contains('is-ready')) showEverything();
  };

  setTimeout(rescue, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rescue();
  });
  window.addEventListener('pageshow', rescue);
}

function initPreloader() {
  const preloader = document.getElementById('preloader');
  const bar = document.getElementById('preloaderProgress');
  const percent = document.getElementById('preloaderPercent');

  const showSite = () => {
    document.body.classList.remove('is-preloading');
    document.body.classList.add('is-ready');
  };

  if (!preloader) {
    showSite();
    return;
  }

  if (document.visibilityState === 'hidden') {
    preloader.classList.add('is-hidden');
    showSite();
    return;
  }

  const assets = Array.from(document.images).filter(img => img.loading !== 'lazy');
  const total = assets.length + 2;
  let loaded = 0;
  let real = 0;
  let shown = 0;
  let finished = false;
  let lastLabel = -1;
  const started = performance.now();
  const MIN_VISIBLE = 900;

  const bump = () => {
    loaded = Math.min(total, loaded + 1);
    real = Math.max(real, Math.round((loaded / total) * 100));
  };

  assets.forEach(img => {
    if (img.complete) {
      bump();
      return;
    }
    img.addEventListener('load', bump, { once: true });
    img.addEventListener('error', bump, { once: true });
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(bump).catch(bump);
  } else {
    bump();
  }

  window.addEventListener('load', () => { real = 100; });
  setTimeout(() => { real = 100; }, 7000);

  const finish = () => {
    if (finished) return;
    finished = true;
    preloader.classList.add('is-hidden');
    setTimeout(showSite, 180);
  };

  const tick = () => {
    shown += (real - shown) * 0.12;
    if (real - shown < 0.4) shown = real;

    if (bar) bar.style.transform = 'scaleX(' + (shown / 100).toFixed(4) + ')';
    const label = Math.round(shown);
    if (percent && label !== lastLabel) {
      lastLabel = label;
      percent.textContent = label + '%';
    }

    if (shown >= 100 && performance.now() - started >= MIN_VISIBLE) {
      finish();
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  setTimeout(finish, 3500);
}

function initHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  let stuck = null;
  let queued = false;

  const apply = () => {
    queued = false;
    const next = window.scrollY > 20;
    if (next === stuck) return;
    stuck = next;
    header.classList.toggle('is-stuck', next);
  };

  apply();
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }, { passive: true });
}

function initDrawer() {
  const drawer = document.getElementById('mobileDrawer');
  const burger = document.getElementById('burgerBtn');
  const closeBtn = document.getElementById('drawerCloseBtn');
  const backdrop = document.getElementById('drawerBackdrop');
  if (!drawer || !burger) return;

  const openDrawer = () => {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
  };

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  };

  burger.addEventListener('click', () => {
    drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('.drawer__link').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 940 && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });
}

function initAccordion() {
  const items = Array.from(document.querySelectorAll('.acc-item'));
  if (!items.length) return;

  const openItem = item => {
    const trigger = item.querySelector('.acc-item__trigger');
    const panel = item.querySelector('.acc-item__panel');
    if (!trigger || !panel) return;

    item.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    panel.style.height = panel.scrollHeight + 'px';
  };

  const closeItem = item => {
    const trigger = item.querySelector('.acc-item__trigger');
    const panel = item.querySelector('.acc-item__panel');
    if (!trigger || !panel || !item.classList.contains('is-open')) return;

    panel.style.height = panel.scrollHeight + 'px';
    void panel.offsetHeight;
    item.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.style.height = '0px';
  };

  items.forEach(item => {
    const trigger = item.querySelector('.acc-item__trigger');
    const panel = item.querySelector('.acc-item__panel');
    if (!trigger || !panel) return;

    panel.addEventListener('transitionend', e => {
      if (e.propertyName !== 'height') return;
      if (item.classList.contains('is-open')) {
        panel.style.height = 'auto';
      }
    });

    trigger.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');

      items.forEach(other => {
        if (other !== item && other.classList.contains('is-open')) {
          closeItem(other);
        }
      });

      if (willOpen) {
        openItem(item);
      } else {
        closeItem(item);
      }
    });
  });
}

function initSeasideGallery() {
  const card = document.getElementById('seasideCard');
  const mainImg = document.getElementById('seasideMainImg');
  const prevBtn = document.getElementById('seasidePrev');
  const nextBtn = document.getElementById('seasideNext');
  const counter = document.getElementById('seasideCounter');
  const thumbs = Array.from(document.querySelectorAll('#seasideThumbs .thumb-btn'));

  if (!card || !mainImg || !thumbs.length) return;

  let currentIndex = 0;

  const updateSlide = index => {
    currentIndex = (index + thumbs.length) % thumbs.length;
    const activeThumb = thumbs[currentIndex];
    const newSrc = activeThumb.dataset.src;
    const newAlt = activeThumb.dataset.alt;

    mainImg.src = newSrc;
    mainImg.alt = newAlt;
    card.dataset.full = newSrc;

    thumbs.forEach((t, i) => {
      t.classList.toggle('is-active', i === currentIndex);
    });

    if (counter) {
      counter.textContent = `${currentIndex + 1} / ${thumbs.length}`;
    }
  };

  thumbs.forEach((thumb, idx) => {
    thumb.addEventListener('click', e => {
      e.stopPropagation();
      updateSlide(idx);
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener('click', e => {
      e.stopPropagation();
      updateSlide(currentIndex - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', e => {
      e.stopPropagation();
      updateSlide(currentIndex + 1);
    });
  }
}

function initLightbox() {
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const closeBtn = document.getElementById('lightboxClose');
  const backdrop = document.getElementById('lightboxBackdrop');
  const works = document.querySelectorAll('.work-card[data-full]');

  if (!box || !img) return;

  const openBox = (src, alt) => {
    img.src = src;
    img.alt = alt || '';
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
  };

  const closeBox = () => {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  };

  works.forEach(work => {
    work.addEventListener('click', () => {
      const activeImg = work.querySelector('.work-card__media img');
      openBox(work.dataset.full, activeImg ? activeImg.alt : '');
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closeBox);
  if (backdrop) backdrop.addEventListener('click', closeBox);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && box.classList.contains('is-open')) {
      closeBox();
    }
  });
}

function initReveal() {
  const targets = Array.from(document.querySelectorAll('.reveal'));
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('is-in'));
    return;
  }

  const seen = new Map();
  targets.forEach(el => {
    const parent = el.parentElement;
    const order = seen.get(parent) || 0;
    seen.set(parent, order + 1);
    el.style.transitionDelay = Math.min(order, 5) * 70 + 'ms';
  });

  const prepare = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.willChange = 'opacity, transform';
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '600px 0px 600px 0px' });

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('is-in');
      obs.unobserve(el);
      el.addEventListener('transitionend', function done(e) {
        if (e.propertyName !== 'transform') return;
        el.removeEventListener('transitionend', done);
        el.style.willChange = '';
        el.style.transitionDelay = '';
      });
    });
  }, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.06
  });

  targets.forEach(el => prepare.observe(el));
  targets.forEach(el => observer.observe(el));
}

function initForm() {
  const form = document.getElementById('projectForm');
  if (!form) return;

  const nameInput = document.getElementById('fName');
  const phoneInput = document.getElementById('fPhone');
  const consentInput = document.getElementById('fConsent');
  const consentLabel = document.getElementById('consentLabel');

  [nameInput, phoneInput].forEach(field => {
    if (field) {
      field.addEventListener('input', () => field.classList.remove('is-error'));
    }
  });

  if (consentInput && consentLabel) {
    consentInput.addEventListener('change', () => consentLabel.classList.remove('is-error'));
  }

  form.addEventListener('submit', e => {
    e.preventDefault();

    let isValid = true;

    if (!nameInput.value.trim()) {
      nameInput.classList.add('is-error');
      isValid = false;
    }

    if (phoneInput.value.trim().length < 4) {
      phoneInput.classList.add('is-error');
      isValid = false;
    }

    if (!isValid) {
      showToast('Пожалуйста, заполните имя и контакт для связи.', 'warn');
      return;
    }

    if (consentInput && !consentInput.checked) {
      if (consentLabel) consentLabel.classList.add('is-error');
      showToast('Необходимо согласие на обработку персональных данных.', 'warn');
      return;
    }

    // ТОЧКА ИНТЕГРАЦИИ ФОРМЫ

    showToast('Заявка успешно отправлена. Мы свяжемся с вами.');
    form.reset();
  });
}

function initPhToggle() {
  document.addEventListener('keydown', e => {
    if (e.altKey && (e.code === 'KeyP')) {
      document.body.classList.toggle('show-ph');
    }
  });

  const btn = document.getElementById('phToggleBtn');
  if (!btn) return;

  const togglePh = () => {
    document.body.classList.toggle('show-ph');
  };

  btn.addEventListener('click', togglePh);

  document.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З')) {
      e.preventDefault();
      togglePh();
    }
  });
}
