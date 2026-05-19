/** Inline browser script for region navigation UI (embedded in index.html). */
export function viewerRegionNavScript() {
  return `
    let regionIndex = null;
    let neighborIndex = null;
    let currentViewScope = {
      gebiet: RegionNav.DEUTSCHLAND_GEBIET,
      untergebiet: '',
      darstellung: 'bundeslaender',
    };
    let simpleFocusContext = null;
    let simpleViewPreset = 'de_landkreis_kreisfrei';
    let savedExpertViewScope = null;
    let simpleViewSelectSyncing = false;

    const gebietSelect = document.getElementById('gebiet-select');
    const untergebietSelect = document.getElementById('untergebiet-select');
    const untergebietWrap = document.getElementById('untergebiet-wrap');
    const darstellungSelect = document.getElementById('darstellung-select');
    const simpleViewSelect = document.getElementById('simple-view-select');
    const simpleViewBlock = document.getElementById('simple-view-block');
    const regionScopeBlock = document.getElementById('region-scope-block');

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

    function isSimpleUiFromUrl() {
      const p = new URLSearchParams(location.search);
      return p.get('ui') === 'simple' || p.get('view') === 'simple';
    }

    function uiMode() {
      if (isUiMinimal()) return 'minimal';
      const p = new URLSearchParams(location.search);
      if (p.get('ui') === 'simple' || p.get('view') === 'simple') return 'simple';
      return 'expert';
    }

    const mapLegendSection = document.getElementById('map-legend-section');
    const viewModeLinksExpertPanel = document.getElementById('view-mode-links-expert-panel');
    let mapLegendToggleLocked = false;

    function applyUiModeClass() {
      document.body.classList.toggle('ui-minimal', uiMode() === 'minimal');
      document.body.classList.toggle('view-simple', uiMode() === 'simple');
      document.body.classList.toggle('view-expert', uiMode() === 'expert');
      if (simpleViewBlock) simpleViewBlock.hidden = uiMode() !== 'simple';
      if (regionScopeBlock) regionScopeBlock.hidden = uiMode() !== 'expert';
      if (viewModeLinksExpertPanel) viewModeLinksExpertPanel.hidden = uiMode() !== 'simple';
      if (mapLegendSection) {
        const simple = uiMode() === 'simple';
        mapLegendSection.open = simple ? true : mapLegendSection.open;
        mapLegendToggleLocked = simple;
      }
      if (typeof syncCsvExportVisibility === 'function') syncCsvExportVisibility();
    }

    applyUiModeClass();

    if (mapLegendSection) {
      mapLegendSection.addEventListener('toggle', () => {
        if (mapLegendToggleLocked) mapLegendSection.open = true;
      });
    }

    function rebuildRegionIndex() {
      regionIndex = RegionNav.buildRegionIndex(allFeatures);
      if (!neighborIndex?.precomputed) neighborIndex = null;
    }

    function ensureNeighborIndex() {
      return neighborIndex;
    }

    function filteredFeaturesForCurrentView() {
      if (uiMode() === 'simple' && simpleFocusContext) {
        const neighbors = ensureNeighborIndex();
        const allowed = SimpleView.computeSimpleAllowedIds(
          simpleViewPreset,
          simpleFocusContext,
          regionIndex,
          neighbors,
        );
        const filtered = SimpleView.filterFeaturesForSimpleView(
          allFeatures,
          simpleViewPreset,
          simpleFocusContext,
          regionIndex,
          allowed,
        );
        if (!filtered.length && SimpleView.presetUsesNeighborFilter(simpleViewPreset)) {
          const fallbackPreset = 'lk_gemeinden';
          const fallback = SimpleView.filterFeaturesForSimpleView(
            allFeatures,
            fallbackPreset,
            simpleFocusContext,
            regionIndex,
            null,
          );
          if (fallback.length) {
            simpleViewPreset = fallbackPreset;
            if (simpleViewSelect) simpleViewSelect.value = fallbackPreset;
            return fallback;
          }
        }
        return filtered;
      }
      return RegionNav.filterFeaturesForView(allFeatures, currentViewScope, regionIndex);
    }

    function populateSimpleViewSelect() {
      if (!simpleViewSelect || !simpleFocusContext) return;
      const presets = SimpleView.listSimplePresetsForFocus(simpleFocusContext, regionIndex, {
        features: allFeatures,
        neighbors: neighborIndex,
      });
      const defaultPreset = SimpleView.defaultSimplePresetForFocus(simpleFocusContext, regionIndex);
      const preferred = presets.includes(simpleViewPreset)
        ? simpleViewPreset
        : presets.includes(defaultPreset)
          ? defaultPreset
          : presets[0];
      simpleViewSelectSyncing = true;
      try {
        simpleViewSelect.replaceChildren();
        for (const id of presets) {
          const el = document.createElement('option');
          el.value = id;
          el.textContent = SimpleView.simplePresetLabel(id, simpleFocusContext, regionIndex);
          simpleViewSelect.appendChild(el);
        }
        if (presets.length) simpleViewSelect.value = preferred;
        simpleViewPreset = simpleViewSelect.value;
      } finally {
        simpleViewSelectSyncing = false;
      }
    }

    function resolveSimpleViewFromUrl() {
      const params = urlParams();
      const focusParam =
        params.get('focus') ||
        (uiMode() === 'simple' ? params.get('gebiet') : null) ||
        regionIndex.deutschlandId ||
        RegionNav.DEUTSCHLAND_GEBIET;
      const ctx = SimpleView.resolveFocusContext(focusParam, regionIndex);
      if (!ctx) return null;
      const allowed = SimpleView.listSimplePresetsForFocus(ctx, regionIndex, {
        features: allFeatures,
        neighbors: neighborIndex,
      });
      let preset = SimpleView.parseSimpleViewPreset(params.get('simple'));
      if (
        preset === 'lk_neighbors_kreisfrei' ||
        preset === 'lk_neighbors_stadtstaat'
      ) {
        preset = 'neighbors_other';
      }
      if (!preset || !allowed.includes(preset)) {
        preset = SimpleView.defaultSimplePresetForFocus(ctx, regionIndex);
      }
      return { ctx, preset };
    }

    function buildPageUrl(overrides) {
      const params = urlParams();
      for (const [key, value] of Object.entries(overrides)) {
        if (value == null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      return location.pathname + (qs ? '?' + qs : '');
    }

    function expertViewScopeFromUrlParams(params) {
      if (!regionIndex) return null;
      const legacyView = params.get('view') || params.get('gebiet');
      if (legacyView === 'simple') return null;
      const gebiet = RegionNav.parseGebietParam(params.get('gebiet') ?? legacyView, regionIndex);
      const untergebiet = RegionNav.parseUntergebietParam(params.get('untergebiet'));
      const parsedDarstellung = RegionNav.parseDarstellungParam(params.get('darstellung'));
      if (uiMode() === 'simple') {
        return {
          gebiet,
          untergebiet,
          darstellung: parsedDarstellung || 'landkreis_kreisfrei',
        };
      }
      let darstellung =
        parsedDarstellung ||
        RegionNav.defaultDarstellungForScope(gebiet, untergebiet, regionIndex, allFeatures);
      const scopeLevel = RegionNav.scopeLevelFor(gebiet, untergebiet);
      if (
        !RegionNav.isPresetAllowedForScope(darstellung, scopeLevel, regionIndex, gebiet, untergebiet)
      ) {
        darstellung = RegionNav.defaultDarstellungForScope(
          gebiet,
          untergebiet,
          regionIndex,
          allFeatures,
        );
      }
      return { gebiet, untergebiet, darstellung };
    }

    function writeExpertScopeToUrlParams(params, scope) {
      if (!scope || !regionIndex) return;
      const defGebiet = RegionNav.DEUTSCHLAND_GEBIET;
      const defDarstellung = RegionNav.defaultDarstellungForScope(
        defGebiet,
        '',
        regionIndex,
        allFeatures,
      );
      if (scope.gebiet && scope.gebiet !== defGebiet) params.set('gebiet', scope.gebiet);
      else params.delete('gebiet');
      if (scope.untergebiet) params.set('untergebiet', scope.untergebiet);
      else params.delete('untergebiet');
      if (scope.darstellung && scope.darstellung !== defDarstellung) {
        params.set('darstellung', scope.darstellung);
      } else {
        params.delete('darstellung');
      }
    }

    function applyExpertScopeToUi(scope) {
      if (!scope) return;
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

    function applyExpertScopeValuesOnly(scope) {
      if (!scope) return;
      gebietSelect.value = scope.gebiet;
      untergebietSelect.value = scope.untergebiet || '';
      if (scope.darstellung) darstellungSelect.value = scope.darstellung;
      currentViewScope = {
        gebiet: scope.gebiet,
        untergebiet: scope.untergebiet || '',
        darstellung: scope.darstellung || darstellungSelect.value || 'bundeslaender',
      };
    }

    function buildSimpleViewUrl(focusId, preset) {
      const ctx = SimpleView.resolveFocusContext(focusId, regionIndex);
      const resolvedPreset =
        preset ||
        (ctx ? SimpleView.defaultSimplePresetForFocus(ctx, regionIndex) : 'de_landkreis_kreisfrei');
      const params = urlParams();
      params.set('ui', 'simple');
      params.set('focus', focusId);
      params.set('simple', resolvedPreset);
      writeExpertScopeToUrlParams(params, savedExpertViewScope ?? currentViewScope);
      const qs = params.toString();
      return location.pathname + (qs ? '?' + qs : '');
    }

    function buildExpertViewUrl(focusId) {
      const scope = SimpleView.expertViewScopeFromFocus(focusId, regionIndex);
      if (!scope) return buildPageUrl({ ui: 'expert', focus: null, simple: null });
      return buildPageUrl({
        ui: 'expert',
        focus: null,
        simple: null,
        gebiet: scope.gebiet,
        untergebiet: scope.untergebiet || null,
        darstellung: scope.darstellung,
      });
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
      if (uiMode() === 'simple') {
        if (!simpleViewSelectSyncing) {
          simpleViewPreset = simpleViewSelect?.value || simpleViewPreset;
        }
        return;
      }
      currentViewScope = readViewScopeFromUi();
    }

    function onSimpleViewChange() {
      if (simpleViewSelectSyncing) return;
      simpleViewPreset = simpleViewSelect.value;
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function onGebietChange() {
      populateUntergebietSelect();
      untergebietSelect.value = '';
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function onUntergebietChange() {
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function onDarstellungChange() {
      syncViewScopeFromUi();
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function labelMinZoomForView() {
      if (uiMode() === 'simple') {
        if (
          simpleViewPreset === 'de_bundeslaender' ||
          simpleViewPreset === 'bl_regierungsbezirke'
        ) {
          return 6;
        }
        if (
          simpleViewPreset === 'de_landkreis_kreisfrei' ||
          simpleViewPreset === 'bl_landkreis_kreisfrei' ||
          simpleViewPreset === 'lk_neighbors_other' ||
          simpleViewPreset === 'lk_neighbors_landkreise' ||
          simpleViewPreset === 'lk_neighbors_gemeinden' ||
          (simpleViewPreset === 'neighbors_other' && simpleFocusContext?.kind === 'landkreis')
        ) {
          return 8;
        }
        return 10;
      }
      const d = currentViewScope.darstellung;
      if (d === 'bundeslaender' || d === 'regierungsbezirke') return 6;
      if (d === 'landkreise' || d === 'landkreis_kreisfrei' || d === 'kreisfreie') return 8;
      if (RegionNav.viewShowsManyGemeinden(currentViewScope)) return 10;
      return 9;
    }

    function viewLabelForCurrentMode() {
      if (uiMode() === 'simple' && simpleFocusContext) {
        return (
          simpleFocusContext.focusName +
          ' · ' +
          SimpleView.simplePresetLabel(simpleViewPreset, simpleFocusContext, regionIndex)
        );
      }
      return RegionNav.viewLabel(currentViewScope, regionIndex);
    }

    function viewShowsGemeindenLevelForCurrentView() {
      if (uiMode() === 'simple') {
        const darstellung = SimpleView.simplePresetDarstellung(
          simpleViewPreset,
          simpleFocusContext,
        );
        return darstellung === 'gemeinden' || darstellung === 'gemeinden_kreisfrei';
      }
      return RegionNav.viewShowsGemeindenLevel(currentViewScope);
    }

    function viewShowsManyGemeindenForCurrentView() {
      if (uiMode() === 'simple') {
        return (
          simpleViewPreset === 'bl_gemeinden_kreisfrei' ||
          simpleViewPreset === 'lk_gemeinden' ||
          simpleViewPreset === 'gm_neighbors' ||
          (simpleViewPreset === 'neighbors_other' && simpleFocusContext?.kind === 'gemeinde')
        );
      }
      return RegionNav.viewShowsManyGemeinden(currentViewScope);
    }

    function scopeBoundsFeaturesForCurrentView() {
      if (uiMode() === 'simple' && simpleFocusContext) {
        const focus = regionIndex.byId.get(simpleFocusContext.focusId);
        if (focus?.geometry) return [focus];
      }
      return RegionNav.scopeBoundsFeatures(
        allFeatures,
        currentViewScope.gebiet,
        currentViewScope.untergebiet,
        regionIndex,
      );
    }

    function resolveViewScopeFromUrl() {
      if (uiMode() === 'simple') {
        const params = urlParams();
        const resolved = resolveSimpleViewFromUrl();
        if (resolved) {
          simpleFocusContext = resolved.ctx;
          simpleViewPreset = resolved.preset;
        }
        const expertFromUrl = expertViewScopeFromUrlParams(params);
        if (expertFromUrl) {
          savedExpertViewScope = expertFromUrl;
          currentViewScope = expertFromUrl;
        }
        return currentViewScope;
      }
      const params = urlParams();
      const legacyView = params.get('view') || params.get('gebiet');
      if (legacyView && legacyView !== 'simple' && !params.get('darstellung')) {
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
      applyUiModeClass();
      if (uiMode() === 'simple') {
        const resolved = resolveSimpleViewFromUrl();
        if (resolved) {
          simpleFocusContext = resolved.ctx;
          simpleViewPreset = resolved.preset;
        }
        applyExpertScopeValuesOnly(savedExpertViewScope ?? scope);
        populateSimpleViewSelect();
        if (typeof syncSimpleCountingNotice === 'function') syncSimpleCountingNotice();
        return;
      }
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

    function rankingFocusChainIds() {
      const chains = [];
      if (selectedFeatureId) {
        chains.push(
          RankingDisplay.focusChainFromParentMap(selectedFeatureId, regionIndex.parentById),
        );
      }
      const simpleFocusId = simpleViewFocusIdForRanking();
      if (simpleFocusId) {
        chains.push(
          RankingDisplay.focusChainFromParentMap(simpleFocusId, regionIndex.parentById),
        );
      }
      return RankingDisplay.mergeFocusChains(chains);
    }

    function simpleViewFocusIdForRanking() {
      if (uiMode() !== 'simple' || !simpleFocusContext?.focusId) return null;
      return simpleFocusContext.focusId;
    }

    function appendViewScopeToUrl(params) {
      if (uiMode() === 'simple') {
        params.set('ui', 'simple');
        if (simpleFocusContext?.focusId) params.set('focus', simpleFocusContext.focusId);
        if (simpleViewPreset) params.set('simple', simpleViewPreset);
        writeExpertScopeToUrlParams(params, savedExpertViewScope ?? currentViewScope);
        return;
      }
      params.delete('ui');
      params.delete('focus');
      params.delete('simple');
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
