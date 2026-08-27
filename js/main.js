document.getElementById("year").textContent = new Date().getFullYear();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const hero = document.querySelector(".hero");
requestAnimationFrame(() => {
  requestAnimationFrame(() => hero.classList.add("is-loaded"));
});

const header = document.getElementById("siteHeader");
const backToTop = document.getElementById("backToTop");
const heroLogo = document.querySelector(".hero-logo");
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

const tickerItems = document.querySelectorAll(".topbar-ticker .ticker-item");
if (tickerItems.length > 1 && !prefersReducedMotion) {
  let tickerIndex = Array.from(tickerItems).findIndex((el) => el.classList.contains("is-active"));
  if (tickerIndex === -1) tickerIndex = 0;
  setInterval(() => {
    tickerItems[tickerIndex].classList.remove("is-active");
    tickerIndex = (tickerIndex + 1) % tickerItems.length;
    tickerItems[tickerIndex].classList.add("is-active");
  }, 20000);
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

const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));
const lightbox = document.getElementById("lightbox");

if (galleryItems.length && lightbox) {
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxCaption = document.getElementById("lightboxCaption");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxPrev = document.getElementById("lightboxPrev");
  const lightboxNext = document.getElementById("lightboxNext");
  let currentIndex = 0;
  let lastFocused = null;

  const showImage = (index) => {
    currentIndex = (index + galleryItems.length) % galleryItems.length;
    const item = galleryItems[currentIndex];
    const img = item.querySelector("img");
    lightboxImg.src = img.getAttribute("src");
    lightboxImg.alt = img.getAttribute("alt") || "";
    lightboxCaption.textContent = item.dataset.caption || "";
  };

  const openLightbox = (index) => {
    lastFocused = document.activeElement;
    showImage(index);
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  };

  galleryItems.forEach((item, index) => {
    item.addEventListener("click", () => openLightbox(index));
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", () => showImage(currentIndex - 1));
  lightboxNext.addEventListener("click", () => showImage(currentIndex + 1));

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showImage(currentIndex - 1);
    if (e.key === "ArrowRight") showImage(currentIndex + 1);
  });
}
