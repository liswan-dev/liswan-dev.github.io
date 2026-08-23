document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a, .floating-dev-menu a').forEach(link => {
    const href = link.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === path) link.classList.add('active');
  });

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const value = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(value);
        const old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => btn.textContent = old, 1200);
      } catch (err) {
        window.location.href = 'mailto:' + value;
      }
    });
  });

  const filterButtons = document.querySelectorAll('[data-filter]');
  const cards = document.querySelectorAll('[data-category]');
  if (filterButtons.length && cards.length) {
    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        const filter = button.getAttribute('data-filter');
        filterButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        cards.forEach(card => {
          const category = card.getAttribute('data-category');
          const show = filter === 'all' || category.includes(filter);
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  const navEl = document.querySelector('.nav');
  if (navEl) {
    const onNavScroll = () => navEl.classList.toggle('scrolled', window.scrollY > 40);
    onNavScroll();
    window.addEventListener('scroll', onNavScroll, { passive: true });
  }

  const revealEls = document.querySelectorAll('.reveal');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (revealEls.length && window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('js-anim');

    if (reduceMotion) {
      gsap.set(revealEls, { opacity: 1, x: 0, y: 0, scale: 1, clipPath: 'inset(0% 0 0% 0)' });
    } else {
      ScrollTrigger.batch(revealEls, {
        start: 'top 85%',
        once: true,
        onEnter: batch => gsap.to(batch, {
          opacity: 1, x: 0, y: 0, scale: 1, clipPath: 'inset(0% 0 0% 0)',
          duration: 0.8, ease: 'power3.out', stagger: 0.12, overwrite: true
        })
      });
    }

    if (!reduceMotion) {
      document.querySelectorAll('[data-parallax]').forEach(el => {
        const factor = parseFloat(el.dataset.parallax) || 0.15;
        gsap.to(el, {
          y: -90 * factor,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });
    }
  } else if (revealEls.length && 'IntersectionObserver' in window) {
    // Fallback if GSAP failed to load (e.g. CDN blocked): simple fade-up via IntersectionObserver.
    document.documentElement.classList.add('js-anim');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('show'); });
    }, { threshold: 0.1 });
    revealEls.forEach(el => obs.observe(el));
  }

  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  const THEME_KEY = 'liswan-theme';
  const themeToggle = document.getElementById('theme-toggle');
  const currentTheme = () => document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paintThemeToggle = () => { if (themeToggle) themeToggle.textContent = currentTheme() === 'dark' ? '☀' : '🌙'; };
  paintThemeToggle();
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      paintThemeToggle();
    });
  }

  const LANG_KEY = 'liswan-lang';
  const langToggle = document.getElementById('lang-toggle');
  function applyLanguage(lang) {
    document.documentElement.setAttribute('lang', lang === 'id' ? 'id' : 'en');
    document.querySelectorAll('[data-id]').forEach(el => {
      if (el.dataset.enCache === undefined) el.dataset.enCache = el.textContent;
      el.textContent = lang === 'id' ? el.getAttribute('data-id') : el.dataset.enCache;
      if (el.hasAttribute('data-text')) el.setAttribute('data-text', el.textContent);
    });
    document.querySelectorAll('[data-placeholder-id]').forEach(el => {
      if (el.dataset.placeholderEnCache === undefined) el.dataset.placeholderEnCache = el.placeholder;
      el.placeholder = lang === 'id' ? el.getAttribute('data-placeholder-id') : el.dataset.placeholderEnCache;
    });
    if (langToggle) langToggle.textContent = lang === 'id' ? 'EN' : 'ID';
  }
  applyLanguage(localStorage.getItem(LANG_KEY) || 'en');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('lang') === 'id' ? 'en' : 'id';
      localStorage.setItem(LANG_KEY, next);
      applyLanguage(next);
    });
  }
});