class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    })
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach(animation => animation.play());
    } else {
      this.animations.forEach(animation => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
    this.hoverMql = window.matchMedia('(min-width: 990px) and (hover: hover)');
    this.summary = this.mainDetailsToggle.querySelector('summary');
    this.closeTimer = null;
    this.onHeaderMenuEnter = this.onHeaderMenuEnter.bind(this);
    this.onHeaderMenuLeave = this.onHeaderMenuLeave.bind(this);
    this.onSummaryClickCapture = this.onSummaryClickCapture.bind(this);
    this.setupHoverMenu();
    this.hoverMql.addEventListener('change', () => this.setupHoverMenu());
  }

  setupHoverMenu() {
    this.removeEventListener('mouseenter', this.onHeaderMenuEnter);
    this.removeEventListener('mouseleave', this.onHeaderMenuLeave);
    if (this.summary) {
      this.summary.removeEventListener('click', this.onSummaryClickCapture, true);
    }
    if (this.hoverMql.matches) {
      this.addEventListener('mouseenter', this.onHeaderMenuEnter);
      this.addEventListener('mouseleave', this.onHeaderMenuLeave);
      if (this.summary) {
        this.summary.addEventListener('click', this.onSummaryClickCapture, true);
      }
    }
  }

  /**
   * Desktop + fine pointer: menus open on hover. Block mouse-only summary clicks while open
   * so a click does not toggle the panel closed (keyboard keeps native toggle via detail === 0).
   */
  onSummaryClickCapture(event) {
    if (!this.hoverMql.matches) return;
    if (event.detail === 0) return;
    if (!this.mainDetailsToggle.hasAttribute('open')) return;
    event.preventDefault();
  }

  onHeaderMenuEnter() {
    if (!this.hoverMql.matches) return;
    window.clearTimeout(this.closeTimer);
    this.closeSiblings();
    if (!this.mainDetailsToggle.hasAttribute('open')) {
      this.mainDetailsToggle.setAttribute('open', '');
      if (this.summary) this.summary.setAttribute('aria-expanded', 'true');
    }
  }

  onHeaderMenuLeave() {
    if (!this.hoverMql.matches) return;
    this.closeTimer = window.setTimeout(() => {
      if (!this.matches(':hover')) {
        this.close();
      }
    }, 180);
  }

  closeSiblings() {
    const root = this.closest('.header__inline-menu');
    if (!root) return;
    root.querySelectorAll('header-menu').forEach((hm) => {
      if (hm !== this && typeof hm.close === 'function') hm.close();
    });
  }

  onToggle() {
    if (!this.header) return;
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    document.documentElement.style.setProperty('--header-bottom-position-desktop', `${Math.floor(this.header.getBoundingClientRect().bottom)}px`);
  }
}

customElements.define('header-menu', HeaderMenu);
