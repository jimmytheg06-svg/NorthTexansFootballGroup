document.getElementById("year").textContent = new Date().getFullYear();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const hero = document.querySelector(".hero");
requestAnimationFrame(() => {
  requestAnimationFrame(() => hero.classList.add("is-loaded"));
});

const header = document.getElementById("siteHeader");
const backToTop = document.getElementById("backToTop");
const heroLogo = document.querySelector(".hero-logo");
const facets = document.querySelectorAll(".facet");
const heroHeight = () => hero.offsetHeight;

let ticking = false;
const onScroll = () => {
  header.classList.toggle("scrolled", window.scrollY > 40);
  backToTop.classList.toggle("visible", window.scrollY > 500);

  if (!prefersReducedMotion && !ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y > 0 && y < heroHeight()) {
        heroLogo.style.transform = `translateY(${y * 0.18}px)`;
        facets.forEach((facet, i) => {
          facet.style.transform = `translateY(${y * (0.08 + i * 0.05)}px)`;
        });
      }
      ticking = false;
    });
  }
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const dotsCanvas = document.querySelector(".hero-dots");
if (dotsCanvas) {
  const ctx = dotsCanvas.getContext("2d");
  const SPACING = 26;
  const BASE_R = 1.1;
  const MAX_R = 3.4;
  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let rafId = null;
  let heroVisible = true;

  const resize = () => {
    width = hero.offsetWidth;
    height = hero.offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    dotsCanvas.width = width * dpr;
    dotsCanvas.height = height * dpr;
    dotsCanvas.style.width = `${width}px`;
    dotsCanvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, width, height);
    const centerY = height * 0.5;
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        const wave =
          Math.sin(x * 0.007 + t * 0.00055) * 0.5 +
          Math.sin(x * 0.003 - t * 0.00032 + y * 0.01) * 0.5;
        const bandY = centerY + wave * (height * 0.28);
        const dist = Math.abs(y - bandY);
        const glow = Math.max(0, 1 - dist / 140);
        const r = BASE_R + glow * (MAX_R - BASE_R);
        const alpha = 0.1 + glow * 0.75;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          glow > 0.35
            ? `rgba(200, 16, 46, ${alpha})`
            : `rgba(159, 179, 200, ${alpha})`;
        ctx.fill();
      }
    }
  };

  const loop = (t) => {
    draw(t);
    if (!prefersReducedMotion && heroVisible) {
      rafId = requestAnimationFrame(loop);
    }
  };

  const start = () => {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  resize();
  draw(0);
  if (!prefersReducedMotion) start();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      draw(performance.now());
    }, 150);
  });

  const heroDotsObserver = new IntersectionObserver(
    (entries) => {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible && !prefersReducedMotion) start();
      else stop();
    },
    { threshold: 0 }
  );
  heroDotsObserver.observe(hero);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (heroVisible && !prefersReducedMotion) start();
  });
}

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.classList.toggle("open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

const revealTargets = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealTargets.forEach((el) => revealObserver.observe(el));

const navLinkEls = document.querySelectorAll("[data-nav-link]");
const spySections = Array.from(navLinkEls)
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const spyObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = `#${entry.target.id}`;
        navLinkEls.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === id);
        });
      }
    });
  },
  { rootMargin: "-45% 0px -45% 0px" }
);
spySections.forEach((section) => spyObserver.observe(section));
