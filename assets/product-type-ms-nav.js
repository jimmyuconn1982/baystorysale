/**
 * Product type 多选：不提交 filter.p.m.custom.sub_category。
 * - 0 / 1 项：整页跳转或 reload（见 applyProductTypeNav）
 * - 多项：Promise.all 并行拉取各子集合 section，合并后一次写入 DOM；用代数 mergeGeneration 丢弃过期结果。
 * - 不在 fetch 上使用 AbortController，避免中止导致「选第 3、4 个不生效」与闪烁。
 * - 防抖期间与合并请求期间：列表区不展示 SKU，仅 spinner；数据就绪后一次写入。
 */
(function () {
  if (window.__bayProductTypeMsNav) return;
  window.__bayProductTypeMsNav = true;

  document.addEventListener(
    'change',
    function (e) {
      var t = e.target;
      if (t && t.matches && t.matches('.product-type-ms-nav input[data-pt-child-handle]')) {
        e.stopPropagation();
        var h = t.getAttribute('data-pt-child-handle');
        var on = t.checked;
        document.querySelectorAll('input[data-pt-child-handle="' + escSel(h) + '"]').forEach(function (inp) {
          if (inp !== t) inp.checked = on;
        });
        syncPendingMergeShell();
        scheduleApply();
      }
    },
    true
  );

  function escSel(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** all-handbags / all-backpacks 等聚合页：单选子类型也应留在本页用 merge 拉子集合商品，勿跳子集合 URL */
  function stayOnAggregatePage() {
    return !!document.querySelector('.product-type-ms-nav[data-stay-on-aggregate="true"]');
  }

  function sortSuffix() {
    var s = new URLSearchParams(window.location.search).get('sort_by');
    return s ? '?sort_by=' + encodeURIComponent(s) : '';
  }

  function stripSubCategoryParams(u) {
    u.searchParams.forEach(function (_v, k) {
      if (k.indexOf('sub_category') !== -1) u.searchParams.delete(k);
    });
  }

  function setPtParam(handles) {
    var u = new URL(window.location.href);
    stripSubCategoryParams(u);
    if (handles.length) u.searchParams.set('pt', handles.slice(0, 8).join(','));
    else u.searchParams.delete('pt');
    var q = u.searchParams.toString();
    window.history.replaceState({}, '', u.pathname + (q ? '?' + q : ''));
  }

  function productDedupeKey(li) {
    var a = li.querySelector('a[href*="/products/"]');
    return a ? a.href : li.innerHTML.slice(0, 200);
  }

  function getCheckedHandles() {
    var seen = {};
    var out = [];
    document.querySelectorAll('.product-type-ms-nav input[data-pt-child-handle]:checked').forEach(function (inp) {
      if (inp.disabled) return;
      var h = inp.getAttribute('data-pt-child-handle');
      if (h && !seen[h]) {
        seen[h] = true;
        out.push(h);
      }
    });
    return out;
  }

  function clearUrlFromDom() {
    var nav = document.querySelector('.product-type-ms-nav[data-clear-url]');
    return nav ? nav.getAttribute('data-clear-url') || '' : '';
  }

  var applyTimer;
  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyProductTypeNav, 320);
  }

  var SPINNER_SVG =
    '<svg aria-hidden="true" focusable="false" role="presentation" class="spinner" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">' +
    '<circle class="path" fill="none" stroke-width="6" cx="33" cy="33" r="30"></circle></svg>';

  /** 防抖等待期间：列表区不展示商品，只显示 spinner（与合并加载同一视觉） */
  function syncPendingMergeShell() {
    var allow = document.querySelector('.product-type-ms-nav[data-allow-merge="true"]');
    var on = allow && getCheckedHandles().length >= 2;
    setPendingMergeShell(!!on);
  }

  function setPendingMergeShell(on) {
    var pc = document.getElementById('ProductGridContainer');
    if (!pc) return;
    var shell = pc.querySelector('.bay-pt-pending-shell');
    if (!on) {
      pc.classList.remove('bay-pt-pending-merge');
      if (shell) shell.hidden = true;
      return;
    }
    pc.classList.add('bay-pt-pending-merge');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'bay-pt-pending-shell';
      shell.setAttribute('role', 'status');
      shell.setAttribute('aria-live', 'polite');
      shell.setAttribute('aria-busy', 'true');
      shell.innerHTML = '<div class="loading-overlay__spinner">' + SPINNER_SVG + '</div>';
      pc.insertBefore(shell, pc.firstChild);
    }
    shell.hidden = false;
  }

  function setGridMergeLoading(on) {
    var grid = document.getElementById('product-grid');
    var container = document.getElementById('ProductGridContainer');
    if (!grid || !container || grid.tagName !== 'UL') return null;
    var col = container.querySelector('.collection');
    if (!col) return null;
    var overlay = col.querySelector('.loading-overlay');
    if (on) {
      col.classList.add('loading', 'bay-pt-merge-loading');
      grid.innerHTML = '';
      if (overlay) {
        overlay.innerHTML =
          '<div class="loading-overlay__spinner bay-pt-merge-spinner" aria-hidden="true">' + SPINNER_SVG + '</div>';
      }
    } else {
      col.classList.remove('loading', 'bay-pt-merge-loading');
      if (overlay) overlay.innerHTML = '';
    }
    return col;
  }

  /** 仅「合并」代数：完成时若已发起更新合并则丢弃本次 DOM/计数写入 */
  var mergeGeneration = 0;

  function applyProductTypeNav() {
    var handles = getCheckedHandles();
    if (handles.length < 2) setPendingMergeShell(false);
    var clearBase = clearUrlFromDom().split('?')[0];
    var sort = sortSuffix();
    var qsBefore = new URLSearchParams(window.location.search);
    var hadPt = qsBefore.has('pt');

    if (handles.length === 0) {
      setPendingMergeShell(false);
      if (!clearBase) return;
      var dest0 = clearBase + sort;
      if (window.location.pathname + window.location.search !== dest0) {
        window.location.href = dest0;
      } else if (hadPt) {
        setPtParam([]);
        window.location.reload();
      }
      return;
    }

    if (handles.length === 1) {
      setPendingMergeShell(false);
      if (stayOnAggregatePage()) {
        mergeProductGrids(handles);
        return;
      }
      var one = document.querySelector(
        '.product-type-ms-nav input[data-pt-child-handle="' + escSel(handles[0]) + '"]'
      );
      if (!one) return;
      var url = one.getAttribute('data-pt-child-url') || '';
      var path = url.split('?')[0];
      if (!path) return;
      var dest1 = path + sort;
      if (window.location.pathname !== path) {
        window.location.href = dest1;
        return;
      }
      setPtParam([]);
      if (hadPt) window.location.reload();
      return;
    }

    var allow = document.querySelector('.product-type-ms-nav[data-allow-merge="true"]');
    if (!allow) {
      setPendingMergeShell(false);
      return;
    }
    mergeProductGrids(handles);
  }

  async function mergeProductGrids(handles) {
    var grid = document.getElementById('product-grid');
    var container = document.getElementById('ProductGridContainer');
    if (!grid || !container || !handles.length) {
      setPendingMergeShell(false);
      return;
    }
    if (grid.tagName !== 'UL') {
      setPendingMergeShell(false);
      return;
    }
    var sectionId = grid.getAttribute('data-id');
    if (!sectionId) {
      setPendingMergeShell(false);
      return;
    }

    var gen = ++mergeGeneration;
    setPtParam(handles);

    setGridMergeLoading(true);
    setPendingMergeShell(false);

    var bust = '&_ptcb=' + Date.now();
    var fetchOne = function (h) {
      var u =
        '/collections/' +
        encodeURIComponent(h) +
        '?section_id=' +
        encodeURIComponent(sectionId) +
        bust;
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        return r.text();
      });
    };

    try {
      var texts = await Promise.all(handles.map(fetchOne));
      if (gen !== mergeGeneration) return;

      var chunks = [];
      var seen = new Set();
      for (var ti = 0; ti < texts.length; ti++) {
        var doc = new DOMParser().parseFromString(texts[ti], 'text/html');
        var remoteGrid = doc.getElementById('product-grid');
        if (!remoteGrid) continue;
        remoteGrid.querySelectorAll(':scope > .grid__item').forEach(function (li) {
          var k = productDedupeKey(li);
          if (!seen.has(k)) {
            seen.add(k);
            chunks.push(li.outerHTML);
          }
        });
      }
      if (gen !== mergeGeneration) return;

      grid.innerHTML = chunks.join('');
      var n = chunks.length;
      var label = n + ' 件商品';
      var c1 = document.getElementById('ProductCount');
      var c2 = document.getElementById('ProductCountDesktop');
      if (c1) c1.textContent = label;
      if (c2) c2.textContent = label;
    } catch (err) {
      console.warn('[product-type-ms-nav]', err);
    } finally {
      if (gen === mergeGeneration) {
        setGridMergeLoading(false);
        setPendingMergeShell(false);
      }
    }
  }

  function bootFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var pt = params.get('pt');
    if (!pt) return;
    var hs = pt
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .slice(0, 8);
    if (!hs.length) return;
    if (stayOnAggregatePage() && hs.length >= 1) {
      hs.forEach(function (h) {
        document.querySelectorAll('input[data-pt-child-handle="' + escSel(h) + '"]').forEach(function (inp) {
          if (!inp.disabled) inp.checked = true;
        });
      });
      mergeProductGrids(hs);
      return;
    }
    if (hs.length < 2) return;
    if (!document.querySelector('.product-type-ms-nav[data-allow-merge="true"]')) return;
    hs.forEach(function (h) {
      document.querySelectorAll('input[data-pt-child-handle="' + escSel(h) + '"]').forEach(function (inp) {
        if (!inp.disabled) inp.checked = true;
      });
    });
    mergeProductGrids(hs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromUrl);
  } else {
    bootFromUrl();
  }

  document.addEventListener('bay-pt-merge-reapply', function () {
    var params = new URLSearchParams(window.location.search);
    var pt = params.get('pt');
    if (!pt) return;
    var hs = pt
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .slice(0, 8);
    if (!hs.length) return;
    if (stayOnAggregatePage() && hs.length >= 1) {
      hs.forEach(function (h) {
        document.querySelectorAll('input[data-pt-child-handle="' + escSel(h) + '"]').forEach(function (inp) {
          if (!inp.disabled) inp.checked = true;
        });
      });
      mergeProductGrids(hs);
      return;
    }
    if (!pt.includes(',')) return;
    if (hs.length < 2) return;
    hs.forEach(function (h) {
      document.querySelectorAll('input[data-pt-child-handle="' + escSel(h) + '"]').forEach(function (inp) {
        if (!inp.disabled) inp.checked = true;
      });
    });
    mergeProductGrids(hs);
  });
})();
