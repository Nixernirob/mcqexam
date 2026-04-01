/* ============================================================
   router.js — Tab navigation (desktop sidebar + mobile bottom nav)
   ============================================================ */

const Router = (() => {
  const tabs = ['live', 'past', 'leaderboard', 'profile'];
  let currentTab = 'live';
  const onTabChangeCallbacks = {};

  function navigateTo(tab) {
    if (!tabs.includes(tab)) return;
    currentTab = tab;

    // Hide all sections, show target
    tabs.forEach(t => {
      const section = document.getElementById('tab-' + t);
      if (section) section.classList.toggle('active', t === tab);
    });

    // Update desktop nav
    document.querySelectorAll('.sidebar .nav-item[data-tab]').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Update mobile nav
    document.querySelectorAll('.bottom-nav .bottom-nav-item[data-tab]').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Fire callbacks
    if (onTabChangeCallbacks[tab]) onTabChangeCallbacks[tab]();
  }

  function onTabChange(tab, cb) {
    onTabChangeCallbacks[tab] = cb;
  }

  function init() {
    // Desktop sidebar clicks
    document.querySelectorAll('.sidebar .nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.tab));
    });

    // Mobile bottom nav clicks
    document.querySelectorAll('.bottom-nav .bottom-nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.tab));
    });
  }

  function getCurrent() { return currentTab; }

  return { init, navigateTo, onTabChange, getCurrent };
})();
