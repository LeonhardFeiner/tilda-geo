/** Inline browser script for region navigation UI (embedded in index.html). */
export function viewerRegionNavScript() {
  return `
    let regionIndex = null;
    let currentViewScope = {
      gebiet: RegionNav.DEUTSCHLAND_GEBIET,
      untergebiet: '',
      darstellung: 'bundeslaender',
    };

    const gebietSelect = document.getElementById('gebiet-select');
    const untergebietSelect = document.getElementById('untergebiet-select');
    const untergebietWrap = document.getElementById('untergebiet-wrap');
    const darstellungSelect = document.getElementById('darstellung-select');

    function readViewScopeFromUi() {
      return {
        gebiet: gebietSelect.value,
        untergebiet: untergebietSelect.value || '',
        darstellung: darstellungSelect.value,
      };
    }

    function isUiMinimal() {
      const p = new URLSearchParams(location.search);
      if (p.get('ui') === 'minimal' || p.get('embed') === '1') return true;
      if (p.get('chrome') === '0') return true;
      const m = (p.get('minimal') ?? '').toLowerCase();
      return m === '1' || m === 'true' || m === 'yes';
    }

    if (isUiMinimal()) document.body.classList.add('ui-minimal');

    function rebuildRegionIndex() {
      regionIndex = RegionNav.buildRegionIndex(allFeatures);
    }

    function filteredFeaturesForCurrentView() {
      return RegionNav.filterFeaturesForView(allFeatures, currentViewScope, regionIndex);
    }

    function populateGebietSelect() {
      gebietSelect.replaceChildren();
      const de = document.createElement('option');
      de.value = RegionNav.DEUTSCHLAND_GEBIET;
      de.textContent = 'Deutschland';
      gebietSelect.appendChild(de);

      const bundeslaender = RegionNav.listAllBundeslaender(regionIndex);
      if (bundeslaender.length) {
        const group = document.createElement('optgroup');
        group.label = 'Bundesländer';
        for (const b of bundeslaender) {
          const el = document.createElement('option');
          el.value = b.id;
          el.textContent = b.name;
          group.appendChild(el);
        }
        gebietSelect.appendChild(group);
      }
    }

    function populateUntergebietSelect() {
      untergebietSelect.replaceChildren();
      const gebiet = gebietSelect.value;
      if (gebiet === RegionNav.DEUTSCHLAND_GEBIET) {
        untergebietWrap.hidden = true;
        untergebietSelect.disabled = true;
        return;
      }
      untergebietWrap.hidden = false;
      untergebietSelect.disabled = false;

      const whole = document.createElement('option');
      whole.value = '';
      whole.textContent = RegionNav.isStadtstaatGebiet(gebiet)
        ? 'Gesamtes Stadtstaat'
        : 'Ganzes Bundesland';
      untergebietSelect.appendChild(whole);

      const rbList = RegionNav.listRegierungsbezirkeInGebiet(gebiet, regionIndex);
      if (rbList.length && !RegionNav.isStadtstaatGebiet(gebiet)) {
        const g = document.createElement('optgroup');
        g.label = 'Regierungsbezirke';
        for (const r of rbList) {
          const el = document.createElement('option');
          el.value = 'rb:' + r.id;
          el.textContent = r.name;
          g.appendChild(el);
        }
        untergebietSelect.appendChild(g);
      }

      if (!RegionNav.isStadtstaatGebiet(gebiet)) {
        const lkList = RegionNav.listLandkreiseInGebiet(gebiet, '', regionIndex);
        if (lkList.length) {
          const g = document.createElement('optgroup');
          g.label = 'Landkreise';
          for (const r of lkList) {
            const el = document.createElement('option');
            el.value = 'lk:' + r.id;
            el.textContent = r.name;
            g.appendChild(el);
          }
          untergebietSelect.appendChild(g);
        }

        const kfList = RegionNav.listKreisfreieInGebiet(gebiet, '', regionIndex);
        if (kfList.length) {
          const g = document.createElement('optgroup');
          g.label = 'Kreisfreie Städte';
          for (const r of kfList) {
            const el = document.createElement('option');
            el.value = 'kreisfrei:' + r.id;
            el.textContent = r.name;
            g.appendChild(el);
          }
          untergebietSelect.appendChild(g);
        }
      } else {
        const bez = RegionNav.listStadtbezirkeInGebiet(gebiet, '', regionIndex);
        if (bez.length) {
          const g = document.createElement('optgroup');
          g.label = 'Bezirke';
          for (const r of bez) {
            const el = document.createElement('option');
            el.value = 'stadt:' + r.id;
            el.textContent = r.name;
            g.appendChild(el);
          }
          untergebietSelect.appendChild(g);
        }
      }
    }

    function populateDarstellungSelect() {
      const scope = readViewScopeFromUi();
      const prev = darstellungSelect.value;
      darstellungSelect.replaceChildren();
      const presets = RegionNav.listDarstellungPresetsForScope(scope, regionIndex, allFeatures);
      for (const preset of presets) {
        const el = document.createElement('option');
        el.value = preset.id;
        el.textContent = RegionNav.presetLabelForScope(preset, scope.gebiet, scope.untergebiet);
        darstellungSelect.appendChild(el);
      }
      const allowed = [...darstellungSelect.options].map((o) => o.value);
      if (allowed.includes(prev)) {
        darstellungSelect.value = prev;
      } else if (allowed.length) {
        const def = RegionNav.defaultDarstellungForScope(
          scope.gebiet,
          scope.untergebiet,
          regionIndex,
          allFeatures,
        );
        darstellungSelect.value = allowed.includes(def) ? def : allowed[0];
      }
    }

    function syncViewScopeFromUi() {
      currentViewScope = readViewScopeFromUi();
    }

    function onGebietChange() {
      populateUntergebietSelect();
      untergebietSelect.value = '';
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      applyCurrentView();
    }

    function onUntergebietChange() {
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      applyCurrentView();
    }

    function onDarstellungChange() {
      syncViewScopeFromUi();
      updateScaleCapDefaultForView();
      applyCurrentView();
    }

    function labelMinZoomForView() {
      const d = currentViewScope.darstellung;
      if (d === 'bundeslaender' || d === 'regierungsbezirke') return 6;
      if (d === 'landkreise' || d === 'landkreis_kreisfrei' || d === 'kreisfreie') return 8;
      if (RegionNav.viewShowsManyGemeinden(currentViewScope)) return 10;
      return 9;
    }

    function resolveViewScopeFromUrl() {
      const params = urlParams();
      const legacyView = params.get('view') || params.get('gebiet');
      if (legacyView && !params.get('darstellung')) {
        const legacy = RegionNav.viewScopeFromLegacyViewId(decodeURIComponent(legacyView), regionIndex);
        if (legacy) return legacy;
      }
      const gebiet = RegionNav.parseGebietParam(params.get('gebiet') ?? legacyView, regionIndex);
      const untergebiet = RegionNav.parseUntergebietParam(params.get('untergebiet'));
      let darstellung =
        RegionNav.parseDarstellungParam(params.get('darstellung')) ||
        RegionNav.defaultDarstellungForScope(gebiet, untergebiet, regionIndex, allFeatures);
      const scopeLevel = RegionNav.scopeLevelFor(gebiet, untergebiet);
      if (!RegionNav.isPresetAllowedForScope(darstellung, scopeLevel, regionIndex, gebiet, untergebiet)) {
        darstellung = RegionNav.defaultDarstellungForScope(gebiet, untergebiet, regionIndex, allFeatures);
      }
      return { gebiet, untergebiet, darstellung };
    }

    function applyViewScopeToUi(scope) {
      gebietSelect.value = scope.gebiet;
      populateUntergebietSelect();
      untergebietSelect.value = scope.untergebiet || '';
      populateDarstellungSelect();
      const allowed = [...darstellungSelect.options].map((o) => o.value);
      darstellungSelect.value = allowed.includes(scope.darstellung)
        ? scope.darstellung
        : darstellungSelect.value;
      currentViewScope = {
        gebiet: gebietSelect.value,
        untergebiet: untergebietSelect.value || '',
        darstellung: darstellungSelect.value,
      };
    }

    function appendViewScopeToUrl(params) {
      const defGebiet = RegionNav.DEUTSCHLAND_GEBIET;
      const defDarstellung = RegionNav.defaultDarstellungForScope(defGebiet, '', regionIndex, allFeatures);
      if (currentViewScope.gebiet !== defGebiet) {
        params.set('gebiet', currentViewScope.gebiet);
      }
      if (currentViewScope.untergebiet) {
        params.set('untergebiet', currentViewScope.untergebiet);
      }
      if (currentViewScope.darstellung !== defDarstellung) {
        params.set('darstellung', currentViewScope.darstellung);
      }
    }
`
}
