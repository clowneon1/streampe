/**
 * StreamPe GitHub Pages Landing Page Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ── 1. Interactive Screenshot Carousel ──────────────────────────────────
  const slides = Array.from(document.querySelectorAll('.carousel-slide'));
  const dots = Array.from(document.querySelectorAll('.dot'));
  const prevBtn = document.querySelector('.carousel-btn.prev');
  const nextBtn = document.querySelector('.carousel-btn.next');
  let currentIndex = 0;
  let autoPlayTimer = null;

  function showSlide(index) {
    if (!slides.length) return;
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;

    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });

    currentIndex = index;
  }

  function nextSlide() {
    showSlide(currentIndex + 1);
  }

  function prevSlide() {
    showSlide(currentIndex - 1);
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(nextSlide, 5000);
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      startAutoPlay();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      startAutoPlay();
    });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      showSlide(i);
      startAutoPlay();
    });
  });

  // Touch Swipe Gesture Support
  const viewport = document.querySelector('.carousel-viewport');
  if (viewport) {
    let startX = 0;
    viewport.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      stopAutoPlay();
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) nextSlide();
        else prevSlide();
      }
      startAutoPlay();
    }, { passive: true });
  }

  // Keyboard Arrow Support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  });

  startAutoPlay();

  // ── 2. Dynamic GitHub Release Fetch ──────────────────────────────────────
  async function fetchLatestRelease() {
    try {
      const res = await fetch('https://api.github.com/repos/clowneon1/streampe/releases/latest');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.tag_name) {
        const versionTag = data.tag_name;
        
        // Update Announcement Bar
        const announcementText = document.querySelector('#announcement-text');
        if (announcementText) {
          announcementText.textContent = `🎉 StreamPe ${versionTag} Released!`;
        }

        // Update Hero Badge
        const versionBadge = document.querySelector('#badge-version');
        if (versionBadge) {
          versionBadge.textContent = `🚀 Version ${versionTag} Out Now`;
        }

        // Update Download Buttons
        const downloadPortableBtn = document.querySelector('#btn-download-portable');
        if (downloadPortableBtn) {
          downloadPortableBtn.textContent = `📦 Download Portable ZIP (${versionTag})`;
        }
        const navDownloadBtn = document.querySelector('#btn-download-nav');
        if (navDownloadBtn) {
          navDownloadBtn.textContent = `Download ${versionTag}`;
        }
      }
    } catch (_) {}
  }

  fetchLatestRelease();
});
