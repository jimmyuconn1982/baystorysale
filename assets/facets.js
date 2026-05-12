class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 500);

    const facetForm = this.querySelector('form');
    facetForm.addEventListener('input', this.debouncedOnSubmit);
    facetForm.addEventListener('change', this.debouncedOnSubmit);

    const facetWrapper = this.querySelector('#FacetsWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) return;
      FacetFiltersForm.renderPage(searchParams, null, false);
    }
    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById('ProductCount');
    const countContainerDesktop = document.getElementById('ProductCountDesktop');
    const ptActive = new URLSearchParams(window.location.search).get('pt') || '';
    const preserveMergedGrid =
      ptActive && !FacetFiltersForm.facetParamsHasStorefrontFilters(searchParams);

    const pg = document.getElementById('ProductGridContainer');
    const gridCol = pg ? pg.querySelector('.collection') : null;
    if (gridCol && !preserveMergedGrid) {
      gridCol.classList.add('loading');
    }
    if (countContainer && !preserveMergedGrid) {
      countContainer.classList.add('loading');
    }
    if (countContainerDesktop && !preserveMergedGrid) {
      countContainerDesktop.classList.add('loading');
    }

    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = element => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl) ?
        FacetFiltersForm.renderSectionFromCache(filterDataUrl, event, searchParams) :
        FacetFiltersForm.renderSectionFromFetch(url, event, searchParams);
    });

    if (updateURLHash) FacetFiltersForm.updateURLHash(searchParams);
  }

  static renderSectionFromFetch(url, event, facetSearchParams) {
    fetch(url)
      .then(response => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html, facetSearchParams);
        FacetFiltersForm.renderProductCount(html, facetSearchParams);
      });
  }

  static renderSectionFromCache(filterDataUrl, event, facetSearchParams) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html, facetSearchParams);
    FacetFiltersForm.renderProductCount(html, facetSearchParams);
  }

  /** Shopify 店面筛选（filter.*）；与 ?pt= 子集合合并是两套机制 */
  static facetParamsHasStorefrontFilters(facetSearchParams) {
    if (facetSearchParams == null || facetSearchParams === '') return false;
    const p = new URLSearchParams(facetSearchParams);
    for (const k of p.keys()) {
      if (k.indexOf('filter.') === 0) return true;
    }
    return false;
  }

  static renderProductGridContainer(html, facetSearchParams) {
    const container = document.getElementById('ProductGridContainer');
    if (!container) return;

    const pt = new URLSearchParams(window.location.search).get('pt') || '';
    const skipDomReplace =
      pt &&
      !FacetFiltersForm.facetParamsHasStorefrontFilters(facetSearchParams);

    if (skipDomReplace) {
      // facet 请求的 section 不含 pt，替换会把合并结果闪成聚合页全量；勿替换。
      const col = container.querySelector('.collection');
      if (col) col.classList.remove('loading');
      // 仅排序变化时重新合并（带 sort_by 的子集合 section）；避免与当前结果相同 sort 时多余 reapply
      const sortNow = new URLSearchParams(facetSearchParams).get('sort_by') || '';
      if (sortNow !== window.__bayPtMergeSortSnapshot) {
        window.__bayPtMergeSortSnapshot = sortNow;
        document.dispatchEvent(new CustomEvent('bay-pt-merge-reapply'));
      }
      return;
    }

    window.__bayPtMergeSortSnapshot = new URLSearchParams(facetSearchParams).get('sort_by') || '';
    container.innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductGridContainer').innerHTML;
    document.dispatchEvent(new CustomEvent('bay-pt-merge-reapply'));
  }

  static renderProductCount(html, facetSearchParams) {
    const pt = new URLSearchParams(window.location.search).get('pt') || '';
    if (pt && !FacetFiltersForm.facetParamsHasStorefrontFilters(facetSearchParams)) {
      const container = document.getElementById('ProductCount');
      const containerDesktop = document.getElementById('ProductCountDesktop');
      if (container) container.classList.remove('loading');
      if (containerDesktop) containerDesktop.classList.remove('loading');
      return;
    }

    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const source = parsed.getElementById('ProductCount');
    const container = document.getElementById('ProductCount');
    const containerDesktop = document.getElementById('ProductCountDesktop');
    if (source) {
      const count = source.innerHTML;
      if (container) {
        container.innerHTML = count;
        container.classList.remove('loading');
      }
      if (containerDesktop) {
        containerDesktop.innerHTML = count;
        containerDesktop.classList.remove('loading');
      }
    } else {
      if (container) container.classList.remove('loading');
      if (containerDesktop) containerDesktop.classList.remove('loading');
    }
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, 'text/html');

    const facetDetailsElements =
      parsedHTML.querySelectorAll('#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter');
    const matchesIndex = (element) => {
      const jsFilter = event ? event.target.closest('.js-filter') : undefined;
      return jsFilter ? element.dataset.index === jsFilter.dataset.index : false;
    }
    const facetsToRender = Array.from(facetDetailsElements).filter(element => !matchesIndex(element));
    const countsToRender = Array.from(facetDetailsElements).find(matchesIndex);

    facetsToRender.forEach((element) => {
      document.querySelector(`.js-filter[data-index="${element.dataset.index}"]`).innerHTML = element.innerHTML;
    });

    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.renderAdditionalElements(parsedHTML);

    if (countsToRender) FacetFiltersForm.renderCounts(countsToRender, event.target.closest('.js-filter'));
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = ['.active-facets-mobile', '.active-facets-desktop'];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    })

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderAdditionalElements(html) {
    const mobileElementSelectors = ['.mobile-facets__open', '.mobile-facets__count', '.sorting'];

    mobileElementSelectors.forEach((selector) => {
      if (!html.querySelector(selector)) return;
      document.querySelector(selector).innerHTML = html.querySelector(selector).innerHTML;
    });

    document.getElementById('FacetFiltersFormMobile').closest('menu-drawer').bindEvents();
  }

  static renderCounts(source, target) {
    const targetElement = target.querySelector('.facets__selected');
    const sourceElement = source.querySelector('.facets__selected');

    const targetElementAccessibility = target.querySelector('.facets__summary');
    const sourceElementAccessibility = source.querySelector('.facets__summary');

    if (sourceElement && targetElement) {
      target.querySelector('.facets__selected').outerHTML = source.querySelector('.facets__selected').outerHTML;
    }

    if (targetElementAccessibility && sourceElementAccessibility) {
      target.querySelector('.facets__summary').outerHTML = source.querySelector('.facets__summary').outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    let q = searchParams;
    // Shop-by-category（product-type-ms-nav）用 ?pt= 存子集合 handle；不在 FacetFiltersForm 的 FormData 里。
    // 原先只在 pt 含逗号时保留，单选 mini-bags 会被 pushState 抹掉，导致合并结果与 URL 同时丢失。
    const pt = new URLSearchParams(window.location.search).get('pt');
    if (pt) {
      q = q ? `${q}&pt=${encodeURIComponent(pt)}` : `pt=${encodeURIComponent(pt)}`;
    }
    history.pushState({ searchParams: q }, '', `${window.location.pathname}${q && '?'.concat(q)}`);
  }

  static getSections() {
    return [
      {
        section: document.getElementById('product-grid').dataset.id,
      }
    ]
  }

  createSearchParams(form) {
    const formData = new FormData(form);
    return new URLSearchParams(formData).toString();
  }

  onSubmitForm(searchParams, event) {
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const sortFilterForms = document.querySelectorAll('facet-filters-form form');
    if (event.srcElement.className == 'mobile-facets__checkbox') {
      const searchParams = this.createSearchParams(event.target.closest('form'))
      this.onSubmitForm(searchParams, event)
    } else {
      const forms = [];
      const isMobile = event.target.closest('form').id === 'FacetFiltersFormMobile';

      sortFilterForms.forEach((form) => {
        if (!isMobile) {
          if (form.id === 'FacetSortForm' || form.id === 'FacetFiltersForm' || form.id === 'FacetSortDrawerForm') {
            forms.push(this.createSearchParams(form));
          }
        } else if (form.id === 'FacetFiltersFormMobile') {
          forms.push(this.createSearchParams(form));
        }
      });
      this.onSubmitForm(forms.join('&'), event)
    }
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url = event.currentTarget.href.indexOf('?') == -1 ? '' : event.currentTarget.href.slice(event.currentTarget.href.indexOf('?') + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define('facet-filters-form', FacetFiltersForm);
FacetFiltersForm.setListeners();

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll('input')
      .forEach(element => element.addEventListener('change', this.onRangeChange.bind(this)));
    this.setMinAndMaxValues();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll('input');
    const minInput = inputs[0];
    const maxInput = inputs[1];
    if (maxInput.value) minInput.setAttribute('max', maxInput.value);
    if (minInput.value) maxInput.setAttribute('min', minInput.value);
    if (minInput.value === '') maxInput.setAttribute('min', 0);
    if (maxInput.value === '') minInput.setAttribute('max', maxInput.getAttribute('max'));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('min'));
    const max = Number(input.getAttribute('max'));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }
}

customElements.define('price-range', PriceRange);

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    const facetLink = this.querySelector('a');
    facetLink.setAttribute('role', 'button');
    facetLink.addEventListener('click', this.closeFilter.bind(this));
    facetLink.addEventListener('keyup', (event) => {
      event.preventDefault();
      if (event.code.toUpperCase() === 'SPACE') this.closeFilter(event);
    });
  }

  closeFilter(event) {
    event.preventDefault();
    const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
    form.onActiveFilterClick(event);
  }
}

customElements.define('facet-remove', FacetRemove);
