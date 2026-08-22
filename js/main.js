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
