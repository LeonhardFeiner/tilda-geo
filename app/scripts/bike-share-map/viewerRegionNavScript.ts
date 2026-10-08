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
    // Neighbour view: the one view the plain scope model (Gebiet / Untergebiet / Zeige) cannot
    // express — "this Landkreis or Gemeinde and the ones around it". While active it is shown as
    // an option in the "Zeige" select, and currentViewScope holds the scope of the focus region
    // (so the breadcrumb and the other Zeige options keep working). The URL carries it as
    // ?focus=<id>&simple=<preset>.
    let neighborViewActive = false;
    let neighborFocus = null;
    let neighborPreset = null;

    const gebietSelect = document.getElementById('gebiet-select');
    const untergebietSelect = document.getElementById('untergebiet-select');
    const untergebietWrap = document.getElementById('untergebiet-wrap');
    const darstellungSelect = document.getElementById('darstellung-select');
    const NEIGHBOR_OPTION_PREFIX = 'nb|';

    function readViewScopeFromUi() {
      // A neighbour option is not a Darstellung: the scope underneath keeps the last real one.
      const neighborOption = darstellungSelect.value.startsWith(NEIGHBOR_OPTION_PREFIX);
      return {
        gebiet: gebietSelect.value,
        untergebiet: untergebietSelect.value || '',
        darstellung: neighborOption ? currentViewScope.darstellung : darstellungSelect.value,
      };
    }

    function isUiMinimal() {
      const p = new URLSearchParams(location.search);
      if (p.get('embed') === '1' || p.get('chrome') === '0') return true;
      const m = (p.get('minimal') ?? '').toLowerCase();
      return m === '1' || m === 'true' || m === 'yes';
    }

    function isNeighborView() {
      return neighborViewActive && !!neighborFocus && !isUiMinimal();
    }

    function exitNeighborView() {
      neighborViewActive = false;
    }

    function applyUiModeClass() {
      document.body.classList.toggle('ui-minimal', isUiMinimal());
    }

    applyUiModeClass();

    // ~11k Bundesland/Landkreis/Gemeinde entries — see RegionSearch.REGION_SEARCH_LEVELS for
    // why the lazy-loaded levels stay out. Needs regionIndex, for the parent names that tell
    // the 11 Neuenkirchen apart.
    let regionSearchEntries = [];

    function rebuildRegionIndex() {
      regionIndex = RegionNav.buildRegionIndex(allFeatures);
      if (!neighborIndex?.precomputed) neighborIndex = null;
      regionSearchEntries = RegionSearch.buildRegionSearchEntries(allFeatures, regionIndex);
    }

    function ensureNeighborIndex() {
      return neighborIndex;
    }

    function filteredFeaturesForCurrentView() {
      if (isNeighborView()) {
        const neighbors = ensureNeighborIndex();
        const allowed = SimpleView.computeSimpleAllowedIds(
          neighborPreset,
          neighborFocus,
          regionIndex,
          neighbors,
        );
        const filtered = SimpleView.filterFeaturesForSimpleView(
          allFeatures,
          neighborPreset,
          neighborFocus,
          regionIndex,
          allowed,
        );
        if (filtered.length) return filtered;
        // Nothing to show around this region (an island, a Stadtstaat): fall back to looking
        // into it, which is what the scope underneath already holds.
        exitNeighborView();
        populateDarstellungSelect();
      }
      return RegionNav.filterFeaturesForView(allFeatures, currentViewScope, regionIndex);
    }

    function applyExpertScopeToUi(scope) {
      if (!scope) return;
      gebietSelect.value = scope.gebiet;
      populateUntergebietSelect();
      untergebietSelect.value = scope.untergebiet || '';
      populateDarstellungSelect();
      const allowed = [...darstellungSelect.options].map((o) => o.value);
      // A Darstellung the scope doesn't offer (a Gemeinde searched inside a Landkreis asks for
      // "gemeinden_kreisfrei", which only a Bundesland lists) falls back to what that scope
      // would show by default — not to the first entry of the list, which can be a coarser view
      // that doesn't contain the region at all.
      const defaultForScope = RegionNav.defaultDarstellungForScope(
        gebietSelect.value,
        untergebietSelect.value || '',
        regionIndex,
        allFeatures,
      );
      const real = allowed.includes(scope.darstellung)
        ? scope.darstellung
        : allowed.includes(defaultForScope)
          ? defaultForScope
          : ([...darstellungSelect.options].find((o) => !o.value.startsWith(NEIGHBOR_OPTION_PREFIX))
              ?.value ?? scope.darstellung);
      currentViewScope = {
        gebiet: gebietSelect.value,
        untergebiet: untergebietSelect.value || '',
        darstellung: real,
      };
      darstellungSelect.value = isNeighborView() ? neighborOptionValue() : real;
      renderRegionBreadcrumb();
    }

    function neighborOptionValue() {
      return NEIGHBOR_OPTION_PREFIX + neighborPreset + '|' + neighborFocus.focusId;
    }

    /**
     * Switch to "<this Landkreis/Gemeinde> and the ones around it". The scope underneath
     * becomes the focus region's own, so the breadcrumb says where you are and the other
     * Zeige options stay the ones that make sense there.
     */
    function enterNeighborView(focusId, preset) {
      const ctx = regionIndex ? SimpleView.resolveFocusContext(focusId, regionIndex) : null;
      if (!ctx || !SimpleView.presetUsesNeighborFilter(preset)) return false;
      neighborFocus = ctx;
      neighborPreset = preset;
      neighborViewActive = true;
      const scope = SimpleView.expertViewScopeFromFocus(ctx.focusId, regionIndex);
      if (scope) applyExpertScopeToUi(scope);
      else populateDarstellungSelect();
      return true;
    }

    /** The neighbour presets that make sense for a region, or [] while the index is unknown. */
    function neighborPresetsFor(ctx) {
      if (!ctx || !regionIndex) return [];
      return SimpleView.listSimplePresetsForFocus(ctx, regionIndex, {
        features: allFeatures,
        neighbors: neighborIndex,
      }).filter((preset) => SimpleView.presetUsesNeighborFilter(preset));
    }

    /** The Landkreis whose neighbours the "Zeige" select can offer: the one you are looking at. */
    function neighborOptionsFocus() {
      if (!regionIndex) return null;
      if (isNeighborView()) return neighborFocus;
      const { gebiet, untergebiet } = currentViewScope;
      if (!untergebiet || !(untergebiet.startsWith('lk:') || untergebiet.startsWith('kreisfrei:'))) {
        return null;
      }
      const id = RegionNav.scopeIdFor(gebiet, untergebiet);
      const ctx = id ? SimpleView.resolveFocusContext(id, regionIndex) : null;
      return ctx && ctx.kind === 'landkreis' ? ctx : null;
    }

    /**
     * The area you are looking at, as a path you can click your way back up. The Gebiet and
     * Untergebiet selects say the same thing between them, but only if you read both and know
     * that "Untergebiet" means "narrow to one Kreis" — and neither offers a way one level up.
     */
    function renderRegionBreadcrumb() {
      const el = document.getElementById('region-breadcrumb');
      if (!el || !regionIndex) return;
      const { gebiet, untergebiet } = currentViewScope;
      const nameOf = (id) => String(regionIndex.byId.get(id)?.properties?.name ?? id);

      const crumbs = [{ label: 'Deutschland', gebiet: RegionNav.DEUTSCHLAND_GEBIET, untergebiet: '' }];
      if (gebiet && gebiet !== RegionNav.DEUTSCHLAND_GEBIET) {
        crumbs.push({ label: nameOf(gebiet), gebiet, untergebiet: '' });
      }
      if (untergebiet) {
        const id = RegionNav.scopeIdFor(gebiet, untergebiet);
        if (id) crumbs.push({ label: nameOf(id), gebiet, untergebiet });
      }

      el.replaceChildren();
      crumbs.forEach((crumb, i) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.className = 'region-breadcrumb-sep';
          sep.textContent = '›';
          el.appendChild(sep);
        }
        const last = i === crumbs.length - 1;
        if (last) {
          const current = document.createElement('span');
          current.className = 'region-breadcrumb-current';
          current.textContent = crumb.label;
          current.setAttribute('aria-current', 'location');
          el.appendChild(current);
          return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = crumb.label;
        button.addEventListener('click', () => goToBreadcrumb(crumb));
        el.appendChild(button);
      });

      renderRegionChildPicker();

      if (crumbs.length > 1) {
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'region-breadcrumb-up';
        up.textContent = '↑ eine Ebene höher';
        up.addEventListener('click', () => goToBreadcrumb(crumbs[crumbs.length - 2]));
        el.appendChild(up);
      }
    }

    /**
     * One step into the area you are looking at: the Bundesländer from Deutschland, the
     * Regierungsbezirke / Landkreise / Kreisfreien Städte from a Bundesland. It reads the
     * options the Gebiet/Untergebiet selects already hold and writes back through them, so the
     * scope handling stays in one place. A single Kreis has nothing further to step into —
     * its Gemeinden are a "Zeige" option.
     */
    function renderRegionChildPicker() {
      const picker = document.getElementById('region-child-select');
      const label = document.getElementById('region-child-label');
      if (!picker || !label) return;
      const { gebiet, untergebiet } = currentViewScope;
      const fromDeutschland = gebiet === RegionNav.DEUTSCHLAND_GEBIET;
      const source = fromDeutschland ? gebietSelect : untergebiet ? null : untergebietSelect;
      picker.replaceChildren();
      if (!source) {
        picker.hidden = true;
        label.hidden = true;
        return;
      }
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = fromDeutschland
        ? 'Bundesland wählen …'
        : RegionNav.isStadtstaatGebiet(gebiet)
          ? 'Bezirk wählen …'
          : 'Landkreis wählen …';
      picker.appendChild(placeholder);
      for (const node of source.children) {
        if (node.tagName === 'OPTION') {
          // The "whole Bundesland" / Deutschland entry is where you already are.
          if (node.value === '' || node.value === RegionNav.DEUTSCHLAND_GEBIET) continue;
        }
        picker.appendChild(node.cloneNode(true));
      }
      picker.value = '';
      const hasChoices = picker.options.length > 1;
      picker.hidden = !hasChoices;
      label.hidden = !hasChoices;
    }

    function onRegionChildPick() {
      const picker = document.getElementById('region-child-select');
      const value = picker.value;
      if (!value) return;
      if (currentViewScope.gebiet === RegionNav.DEUTSCHLAND_GEBIET) {
        gebietSelect.value = value;
        onGebietChange();
      } else {
        untergebietSelect.value = value;
        onUntergebietChange();
      }
    }

    function goToBreadcrumb(crumb) {
      // A jump up is a step of its own in the browser history.
      scheduleUrlSync('push');
      exitNeighborView();
      applyExpertScopeToUi({
        gebiet: crumb.gebiet,
        untergebiet: crumb.untergebiet,
        darstellung: RegionNav.defaultDarstellungForScope(
          crumb.gebiet,
          crumb.untergebiet,
          regionIndex,
          allFeatures,
        ),
      });
      updateScaleCapDefaultForView();
      void applyCurrentView();
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
      const presets = RegionNav.listDarstellungPresetsForScope(
        scope,
        regionIndex,
        allFeatures,
        currentLazyPresence(),
      );
      for (const preset of presets) {
        const el = document.createElement('option');
        el.value = preset.id;
        el.textContent = RegionNav.presetLabelForScope(preset, scope.gebiet, scope.untergebiet);
        darstellungSelect.appendChild(el);
      }
      const realOptionValues = [...darstellungSelect.options].map((o) => o.value);
      appendNeighborOptions();
      const allowed = [...darstellungSelect.options].map((o) => o.value);
      if (isNeighborView() && allowed.includes(neighborOptionValue())) {
        darstellungSelect.value = neighborOptionValue();
      } else if (allowed.includes(prev) && !(isNeighborView() && prev.startsWith(NEIGHBOR_OPTION_PREFIX))) {
        darstellungSelect.value = prev;
      } else if (realOptionValues.length) {
        const def = RegionNav.defaultDarstellungForScope(
          scope.gebiet,
          scope.untergebiet,
          regionIndex,
          allFeatures,
        );
        darstellungSelect.value = realOptionValues.includes(def) ? def : realOptionValues[0];
      }
    }

    function appendNeighborOptions() {
      const focus = neighborOptionsFocus();
      if (!focus) return;
      const presets = neighborPresetsFor(focus);
      // The active one is always listed, also while the index that proves it applicable is
      // still loading — otherwise the select would show a different view than the map.
      if (isNeighborView() && !presets.includes(neighborPreset)) presets.push(neighborPreset);
      if (!presets.length) return;
      const group = document.createElement('optgroup');
      group.label = 'Nachbarn';
      for (const preset of presets) {
        const el = document.createElement('option');
        el.value = NEIGHBOR_OPTION_PREFIX + preset + '|' + focus.focusId;
        el.textContent = SimpleView.simplePresetLabel(preset, focus, regionIndex);
        group.appendChild(el);
      }
      darstellungSelect.appendChild(group);
    }

    function syncViewScopeFromUi() {
      currentViewScope = readViewScopeFromUi();
      renderRegionBreadcrumb();
    }

    function onGebietChange() {
      // A view change is a step of its own in the browser history.
      scheduleUrlSync('push');
      exitNeighborView();
      populateUntergebietSelect();
      untergebietSelect.value = '';
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function onUntergebietChange() {
      // A view change is a step of its own in the browser history.
      scheduleUrlSync('push');
      exitNeighborView();
      populateDarstellungSelect();
      syncViewScopeFromUi();
      currentViewScope.darstellung = darstellungSelect.value;
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    function onDarstellungChange() {
      const value = darstellungSelect.value;
      // A view change is a step of its own in the browser history.
      scheduleUrlSync('push');
      if (value.startsWith(NEIGHBOR_OPTION_PREFIX)) {
        const [, preset, focusId] = value.split('|');
        if (!enterNeighborView(focusId, preset)) exitNeighborView();
      } else {
        exitNeighborView();
        syncViewScopeFromUi();
      }
      updateScaleCapDefaultForView();
      void applyCurrentView();
    }

    /** From a region card: show that Landkreis/Gemeinde together with the ones around it. */
    async function showWithNeighbors(focusId) {
      const ctx = regionIndex ? SimpleView.resolveFocusContext(focusId, regionIndex) : null;
      if (!ctx) return false;
      await whenNeighborsReady();
      const presets = neighborPresetsFor(ctx);
      // What people mean by "compare with my neighbours": their Gemeinde's neighbouring
      // Gemeinden, their Landkreis's neighbouring Kreise — not 250 Gemeinden around a Kreis.
      const preferred =
        ctx.kind === 'gemeinde'
          ? ['gm_neighbors', 'neighbors_other']
          : ['neighbors_other', 'lk_neighbors_landkreise'];
      const preset = preferred.find((id) => presets.includes(id)) ?? presets[0];
      if (!preset) return false;
      scheduleUrlSync('push');
      if (!enterNeighborView(focusId, preset)) return false;
      updateScaleCapDefaultForView();
      await applyCurrentView();
      return true;
    }

    function labelMinZoomForView() {
      if (isNeighborView()) {
        if (
          neighborPreset === 'lk_neighbors_other' ||
          neighborPreset === 'lk_neighbors_landkreise' ||
          neighborPreset === 'lk_neighbors_gemeinden' ||
          (neighborPreset === 'neighbors_other' && neighborFocus.kind === 'landkreis')
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
      if (isNeighborView()) {
        return SimpleView.simplePresetLabel(neighborPreset, neighborFocus, regionIndex);
      }
      return RegionNav.viewLabel(currentViewScope, regionIndex);
    }

    function viewShowsGemeindenLevelForCurrentView() {
      if (isNeighborView()) {
        const darstellung = SimpleView.simplePresetDarstellung(neighborPreset, neighborFocus);
        return darstellung === 'gemeinden' || darstellung === 'gemeinden_kreisfrei';
      }
      return RegionNav.viewShowsGemeindenLevel(currentViewScope);
    }

    function viewShowsManyGemeindenForCurrentView() {
      if (isNeighborView()) {
        return (
          neighborPreset === 'gm_neighbors' ||
          (neighborPreset === 'neighbors_other' && neighborFocus.kind === 'gemeinde')
        );
      }
      return RegionNav.viewShowsManyGemeinden(currentViewScope);
    }

    function scopeBoundsFeaturesForCurrentView() {
      if (isNeighborView()) {
        const focus = regionIndex.byId.get(neighborFocus.focusId);
        if (focus?.geometry) return [focus];
      }
      return RegionNav.scopeBoundsFeatures(
        allFeatures,
        currentViewScope.gebiet,
        currentViewScope.untergebiet,
        regionIndex,
      );
    }

    /**
     * ?focus=<id>&simple=<neighbour preset> — the neighbour view. Returns null when the URL
     * doesn't name one, so the plain gebiet/untergebiet/darstellung scope applies.
     */
    function resolveFocusViewFromUrl(params) {
      const ctx = SimpleView.resolveFocusContext(params.get('focus'), regionIndex);
      const preset = SimpleView.parseSimpleViewPreset(params.get('simple'));
      if (!params.get('focus') || !ctx || !preset || !SimpleView.presetUsesNeighborFilter(preset)) {
        return null;
      }
      const scope = SimpleView.expertViewScopeFromFocus(ctx.focusId, regionIndex);
      if (!scope) return null;
      neighborFocus = ctx;
      neighborPreset = preset;
      neighborViewActive = !isUiMinimal();
      return scope;
    }

    function resolveViewScopeFromUrl() {
      const params = urlParams();
      neighborViewActive = false;
      const focusScope = resolveFocusViewFromUrl(params);
      if (focusScope) return focusScope;
      const gebiet = RegionNav.parseGebietParam(params.get('gebiet'), regionIndex);
      const untergebiet = RegionNav.parseUntergebietParam(params.get('untergebiet'));
      let darstellung =
        RegionNav.parseDarstellungParam(params.get('darstellung')) ||
        RegionNav.defaultDarstellungForScope(gebiet, untergebiet, regionIndex, allFeatures);
      const scopeLevel = RegionNav.scopeLevelFor(gebiet, untergebiet);
      if (
        !RegionNav.isPresetAllowedForScope(
          darstellung,
          scopeLevel,
          regionIndex,
          gebiet,
          untergebiet,
          currentLazyPresence(),
        )
      ) {
        darstellung = RegionNav.defaultDarstellungForScope(gebiet, untergebiet, regionIndex, allFeatures);
      }
      return { gebiet, untergebiet, darstellung };
    }

    function applyViewScopeToUi(scope) {
      applyUiModeClass();
      applyExpertScopeToUi(scope);
    }

    function rankingFocusChainIds() {
      const chains = [];
      if (selectedFeatureId) {
        chains.push(
          RankingDisplay.focusChainFromParentMap(selectedFeatureId, regionIndex.parentById),
        );
      }
      const neighborFocusId = neighborViewFocusIdForRanking();
      if (neighborFocusId) {
        chains.push(
          RankingDisplay.focusChainFromParentMap(neighborFocusId, regionIndex.parentById),
        );
      }
      return RankingDisplay.mergeFocusChains(chains);
    }

    function neighborViewFocusIdForRanking() {
      return isNeighborView() ? neighborFocus.focusId : null;
    }

    function appendViewScopeToUrl(params) {
      params.delete('gebiet');
      params.delete('untergebiet');
      params.delete('darstellung');
      if (isNeighborView()) {
        // The focus region fully determines the scope underneath, so only it is written.
        params.set('focus', neighborFocus.focusId);
        params.set('simple', neighborPreset);
        return;
      }
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
