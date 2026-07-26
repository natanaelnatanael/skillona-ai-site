(() => {
  "use strict";

  function readStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  const sb = (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  const state = {
    viewer: null,
    dataSource: null,
    allListings: [],
    visibleListings: [],
    favorites: new Set(readStorage("skillona-favorites", [])),
    selectedId: null,
    searchTerm: "",
    session: null,
    isAdmin: false
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const els = {};

  const fallbackImage = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    state.allListings = loadLocalListings();
    bindEvents();
    updateFavoriteCount();
    initGlobe();
    applyFilters();
    if (sb) {
      const { data } = await sb.auth.getSession();
      state.session = data && data.session ? data.session : null;
      await loadUserRole();
      updateAuthUi();
      sb.auth.onAuthStateChange(async (_event, session) => {
        state.session = session;
        await loadUserRole();
        updateAuthUi();
        refreshRemoteListings();
      });
      await refreshRemoteListings();
    }
  }

  async function loadUserRole() {
    state.isAdmin = false;
    if (!sb || !state.session) return;
    try {
      const { data } = await sb.from("profiles").select("account_type").eq("id", state.session.user.id).single();
      state.isAdmin = Boolean(data && data.account_type === "admin");
    } catch (err) {
      console.error("Loading profile failed:", err);
    }
  }

  function statusLabel(status) {
    return ({
      pending_review: "Pending review",
      rejected: "Rejected",
      paused: "Paused",
      sold: "Sold",
      rented: "Rented",
      expired: "Expired"
    })[status] || "";
  }

  async function refreshRemoteListings() {
    if (!sb) return;
    try {
      let query = sb
        .from("listings")
        .select("id,title,country,city,latitude,longitude,property_type,transaction_type,price,currency,interior_area,bedrooms,bathrooms,sea_view,is_featured,published_at,created_at,description,status,user_id,listing_images(file_url,is_primary,sort_order)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (state.isAdmin) {
        query = query.in("status", ["active", "pending_review"]);
      } else if (state.session) {
        query = query.or(`status.eq.active,user_id.eq.${state.session.user.id}`);
      } else {
        query = query.eq("status", "active");
      }
      const { data, error } = await query;
      if (error) throw error;
      const remote = (data || []).map(mapDbListing);
      state.allListings = [...remote, ...(window.SEED_LISTINGS || [])];
      applyFilters();
      if (state.selectedId) {
        const stillThere = state.allListings.some(l => String(l.id) === String(state.selectedId));
        if (!stillThere) closeDetails();
      }
    } catch (err) {
      console.error("Loading listings from database failed:", err);
      showToast("Live database unavailable — showing demo listings");
    }
  }

  function mapDbListing(row) {
    const images = Array.isArray(row.listing_images) ? [...row.listing_images] : [];
    images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.sort_order || 0) - (b.sort_order || 0));
    return {
      id: row.id,
      title: row.title,
      country: row.country || "",
      city: row.city || "",
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      type: row.property_type,
      transaction: row.transaction_type === "sale" ? "sale" : "rent",
      price: Number(row.price || 0),
      currency: row.currency || "EUR",
      area: Number(row.interior_area || 0),
      bedrooms: Number(row.bedrooms || 0),
      bathrooms: Number(row.bathrooms || 0),
      coastal: Boolean(row.sea_view),
      featured: Boolean(row.is_featured),
      createdAt: String(row.published_at || row.created_at || "").slice(0, 10),
      image: images.length ? images[0].file_url : fallbackImage,
      description: row.description || "",
      remote: true,
      status: row.status,
      ownerId: row.user_id
    };
  }

  function updateAuthUi() {
    if (!els.authButton) return;
    if (state.session && state.session.user) {
      const email = state.session.user.email || "Account";
      els.authButton.textContent = `${email} · Sign out`;
      els.authButton.title = "Click to sign out";
    } else {
      els.authButton.textContent = "Sign in";
      els.authButton.title = "";
    }
  }

  function cacheElements() {
    [
      "searchInput", "searchButton", "transactionFilter", "typeFilter", "minPrice", "maxPrice",
      "coastalFilter", "applyFilters", "resetFilters", "sortSelect", "listingResults", "resultCount",
      "resultContext", "detailPanel", "detailContent", "closeDetail", "openAddListing", "closeAddListing",
      "addListingModal", "modalBackdrop", "addListingForm", "toast", "favoriteCount", "favoritesButton",
      "resetGlobe", "locateMediterranean", "loadingState", "sidebar", "openSidebar", "closeSidebar",
      "authButton", "authModal", "closeAuth", "authForm", "authMessage", "signUpButton", "publishButton"
    ].forEach(id => { els[id] = document.getElementById(id); });
  }

  function loadLocalListings() {
    const userListings = readStorage("skillona-user-listings", []);
    return [...(window.SEED_LISTINGS || []), ...userListings];
  }

  function bindEvents() {
    els.searchButton.addEventListener("click", runSearch);
    els.searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") runSearch();
    });
    let searchTimer;
    els.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchTerm = els.searchInput.value.trim();
        applyFilters();
      }, 250);
    });
    [els.transactionFilter, els.typeFilter, els.coastalFilter].forEach(el =>
      el.addEventListener("change", applyFilters)
    );
    [els.minPrice, els.maxPrice].forEach(el => el.addEventListener("change", applyFilters));
    els.applyFilters.addEventListener("click", applyFilters);
    els.resetFilters.addEventListener("click", resetFilters);
    els.sortSelect.addEventListener("change", applyFilters);
    els.closeDetail.addEventListener("click", closeDetails);
    els.openAddListing.addEventListener("click", openAddListing);
    els.closeAddListing.addEventListener("click", closeAddListing);
    els.modalBackdrop.addEventListener("click", () => { closeAddListing(); closeAuth(); });
    els.addListingForm.addEventListener("submit", submitListing);
    els.resetGlobe.addEventListener("click", viewWorld);
    els.locateMediterranean.addEventListener("click", () => flyTo(17.5, 38.5, 4200000));
    els.favoritesButton.addEventListener("click", showFavorites);
    els.openSidebar.addEventListener("click", () => els.sidebar.classList.add("is-open"));
    els.closeSidebar.addEventListener("click", () => els.sidebar.classList.remove("is-open"));
    if (els.authButton) els.authButton.addEventListener("click", handleAuthButton);
    if (els.closeAuth) els.closeAuth.addEventListener("click", closeAuth);
    if (els.authForm) els.authForm.addEventListener("submit", event => handleAuth(event, "signin"));
    if (els.signUpButton) els.signUpButton.addEventListener("click", event => handleAuth(event, "signup"));
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeDetails();
        closeAddListing();
        closeAuth();
        els.sidebar.classList.remove("is-open");
      }
    });
  }

  function initGlobe() {
    try {
      const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        credit: "© OpenStreetMap contributors"
      });

      state.viewer = new Cesium.Viewer("cesiumContainer", {
        // Cesium 1.107+ removed the `imageryProvider` constructor option;
        // the base imagery must be passed as an ImageryLayer instead.
        baseLayer: new Cesium.ImageryLayer(imageryProvider),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      state.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#071625");
      state.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#01070d");
      state.viewer.scene.skyAtmosphere.hueShift = -0.05;
      state.viewer.scene.skyAtmosphere.saturationShift = -0.25;
      state.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 220;
      state.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45000000;
      state.viewer.scene.fog.enabled = true;
      state.viewer.scene.fog.density = 0.00018;

      state.dataSource = new Cesium.CustomDataSource("properties");
      state.dataSource.clustering.enabled = true;
      state.dataSource.clustering.pixelRange = 55;
      state.dataSource.clustering.minimumClusterSize = 3;
      state.viewer.dataSources.add(state.dataSource);

      state.dataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
        cluster.label.show = true;
        cluster.billboard.show = false;
        cluster.point.show = true;
        cluster.point.pixelSize = 34;
        cluster.point.color = Cesium.Color.fromCssColorString("#47d7b0").withAlpha(0.92);
        cluster.point.outlineColor = Cesium.Color.WHITE.withAlpha(0.9);
        cluster.point.outlineWidth = 2;
        cluster.label.text = String(clusteredEntities.length);
        cluster.label.fillColor = Cesium.Color.fromCssColorString("#032219");
        cluster.label.font = "700 13px system-ui";
        cluster.label.pixelOffset = new Cesium.Cartesian2(0, 5);
        cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      });

      const clickHandler = new Cesium.ScreenSpaceEventHandler(state.viewer.scene.canvas);
      clickHandler.setInputAction(movement => {
        const picked = state.viewer.scene.pick(movement.position);
        if (!Cesium.defined(picked)) return;
        const id = picked.id?.properties?.listingId?.getValue?.() || picked.id?.listingId;
        if (id) openDetails(String(id), true);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      viewWorld(false);
      setTimeout(() => els.loadingState.classList.add("is-hidden"), 700);
    } catch (error) {
      console.error(error);
      els.loadingState.innerHTML = "<strong>The globe could not load</strong><span>Check the internet connection and reload the page.</span>";
    }
  }

  function renderGlobeListings(listings) {
    if (!state.dataSource) return;
    state.dataSource.entities.removeAll();

    listings.forEach(listing => {
      const entity = state.dataSource.entities.add({
        id: `listing-${listing.id}`,
        position: Cesium.Cartesian3.fromDegrees(Number(listing.longitude), Number(listing.latitude), 35),
        point: {
          pixelSize: listing.featured ? 15 : 12,
          color: Cesium.Color.fromCssColorString(listing.featured ? "#6ce9c8" : "#47d7b0"),
          outlineColor: Cesium.Color.fromCssColorString("#04231b"),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1e3, 1.25, 1.8e7, 0.7)
        },
        label: {
          text: formatCompactPrice(listing),
          font: "700 12px system-ui",
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#071827").withAlpha(0.88),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          pixelOffset: new Cesium.Cartesian2(0, -25),
          style: Cesium.LabelStyle.FILL,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2600000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        properties: { listingId: listing.id }
      });
      entity.listingId = listing.id;
    });
    state.viewer?.scene.requestRender();
  }

  function applyFilters() {
    const transaction = els.transactionFilter.value;
    const type = els.typeFilter.value;
    const minPrice = Number(els.minPrice.value || 0);
    const maxPrice = Number(els.maxPrice.value || Number.MAX_SAFE_INTEGER);
    const coastalOnly = els.coastalFilter.checked;
    const term = state.searchTerm.trim().toLowerCase();

    let results = state.allListings.filter(listing => {
      const searchable = `${listing.title} ${listing.city} ${listing.country} ${listing.type}`.toLowerCase();
      return (transaction === "all" || listing.transaction === transaction)
        && (type === "all" || listing.type === type)
        && Number(listing.price) >= minPrice
        && Number(listing.price) <= maxPrice
        && (!coastalOnly || listing.coastal)
        && (!term || searchable.includes(term));
    });

    results = sortListings(results, els.sortSelect.value);
    state.visibleListings = results;
    renderListingCards(results);
    renderGlobeListings(results);
    updateResultsHeading(results);
  }

  function sortListings(listings, sort) {
    const copy = [...listings];
    if (sort === "price-asc") return copy.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") return copy.sort((a, b) => b.price - a.price);
    if (sort === "newest") return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return copy.sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderListingCards(listings) {
    if (!listings.length) {
      els.listingResults.innerHTML = `<div class="empty-state"><strong>No properties found</strong><span>Change the filters or search another location.</span></div>`;
      return;
    }

    els.listingResults.innerHTML = listings.map(listing => `
      <article class="listing-card" data-id="${escapeHtml(listing.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(listing.title)}">
        <div class="listing-image-wrap">
          <img class="listing-image" src="${escapeHtml(listing.image || fallbackImage)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'" />
          <span class="listing-badge ${listing.status && listing.status !== "active" ? "badge-status" : ""}">${listing.status && listing.status !== "active" ? statusLabel(listing.status) : listing.transaction === "rent" ? "For rent" : listing.featured ? "Featured" : "For sale"}</span>
          <button class="favorite-card ${state.favorites.has(listing.id) ? "is-favorite" : ""}" data-favorite="${escapeHtml(listing.id)}" type="button" aria-label="Save property">♥</button>
        </div>
        <div class="listing-card-content">
          <h3>${escapeHtml(listing.title)}</h3>
          <div class="listing-location">${escapeHtml(listing.city)}, ${escapeHtml(listing.country)}</div>
          <div class="listing-price">${formatPrice(listing)}</div>
          <div class="listing-meta">
            <span>${numberFormat(listing.area)} m²</span>
            ${listing.bedrooms ? `<span>${listing.bedrooms} beds</span>` : ""}
            ${listing.bathrooms ? `<span>${listing.bathrooms} baths</span>` : ""}
          </div>
        </div>
      </article>
    `).join("");

    els.listingResults.querySelectorAll(".listing-card").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("[data-favorite]")) return;
        openDetails(card.dataset.id, true);
      });
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails(card.dataset.id, true);
        }
      });
    });

    els.listingResults.querySelectorAll("[data-favorite]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        toggleFavorite(button.dataset.favorite);
      });
    });
  }

  function updateResultsHeading(listings) {
    els.resultCount.textContent = `${listings.length} ${listings.length === 1 ? "property" : "properties"}`;
    els.resultContext.textContent = state.searchTerm ? `matching “${state.searchTerm}”` : "around the world";
  }

  function runSearch() {
    state.searchTerm = els.searchInput.value.trim();
    applyFilters();
    if (!state.visibleListings.length) {
      showToast("No matching location or property found");
      return;
    }

    const exact = state.visibleListings.find(listing =>
      listing.country.toLowerCase() === state.searchTerm.toLowerCase()
      || listing.city.toLowerCase() === state.searchTerm.toLowerCase()
    ) || state.visibleListings[0];

    flyTo(exact.longitude, exact.latitude, state.visibleListings.length > 1 ? 1800000 : 150000);
    if (window.innerWidth <= 980) els.sidebar.classList.remove("is-open");
  }

  function resetFilters() {
    els.transactionFilter.value = "all";
    els.typeFilter.value = "all";
    els.minPrice.value = "";
    els.maxPrice.value = "";
    els.coastalFilter.checked = false;
    els.sortSelect.value = "featured";
    els.searchInput.value = "";
    state.searchTerm = "";
    applyFilters();
    viewWorld();
  }

  function openDetails(id, fly = false) {
    const listing = state.allListings.find(item => String(item.id) === String(id));
    if (!listing) return;
    state.selectedId = listing.id;
    els.detailContent.innerHTML = `
      <div class="detail-hero"><img src="${escapeHtml(listing.image || fallbackImage)}" alt="${escapeHtml(listing.title)}" onerror="this.onerror=null;this.src='${fallbackImage}'" /></div>
      <div class="detail-body">
        <div class="detail-kicker">${escapeHtml(labelType(listing.type))} · ${listing.transaction === "rent" ? "For rent" : "For sale"}</div>
        <h2>${escapeHtml(listing.title)}</h2>
        <div class="detail-price">${formatPrice(listing)}</div>
        <div class="detail-location">${escapeHtml(listing.city)}, ${escapeHtml(listing.country)}</div>
        <div class="detail-facts">
          <div class="detail-fact"><strong>${numberFormat(listing.area)} m²</strong><span>Interior / land area</span></div>
          <div class="detail-fact"><strong>${listing.bedrooms || "—"}</strong><span>Bedrooms</span></div>
          <div class="detail-fact"><strong>${listing.bathrooms || "—"}</strong><span>Bathrooms</span></div>
        </div>
        <p class="detail-description">${escapeHtml(listing.description)}</p>
        <div class="detail-actions">
          <button class="primary-button" id="contactSeller" type="button">Contact seller</button>
          <button class="ghost-button" id="saveDetail" type="button">${state.favorites.has(listing.id) ? "♥ Saved" : "♡ Save"}</button>
        </div>
        ${listing.status && listing.status !== "active" ? `<p class="detail-status-note">Status: ${statusLabel(listing.status)}${listing.status === "pending_review" ? " — visible only to you and the moderators until approved." : ""}</p>` : ""}
        ${state.isAdmin && listing.remote ? `
          <div class="admin-actions">
            <strong>Moderation</strong>
            <div class="detail-actions">
              ${listing.status !== "active" ? `<button class="primary-button" data-moderate="approve" type="button">Approve</button>` : ""}
              ${listing.status !== "rejected" ? `<button class="secondary-button" data-moderate="reject" type="button">Reject</button>` : ""}
              <button class="ghost-button" data-moderate="delete" type="button">Delete</button>
            </div>
          </div>` : ""}
        <p class="detail-disclaimer">Prototype listing. Skillona Globe is an advertising platform and does not verify ownership, legal status or listing accuracy in this demo.</p>
      </div>
    `;
    els.detailPanel.classList.add("is-open");
    els.detailPanel.setAttribute("aria-hidden", "false");
    document.getElementById("contactSeller").addEventListener("click", () => showToast("Seller messaging will be connected in the account stage"));
    document.getElementById("saveDetail").addEventListener("click", () => toggleFavorite(listing.id, true));
    els.detailContent.querySelectorAll("[data-moderate]").forEach(btn => {
      btn.addEventListener("click", () => moderateListing(listing, btn.dataset.moderate));
    });
    if (fly) flyTo(listing.longitude, listing.latitude, 75000);
  }

  async function moderateListing(listing, action) {
    if (!sb || !state.isAdmin) return;
    try {
      if (action === "delete") {
        if (!window.confirm("Permanently delete this listing?")) return;
        const { error } = await sb.from("listings").delete().eq("id", listing.id);
        if (error) throw error;
        showToast("Listing deleted");
        closeDetails();
      } else if (action === "approve") {
        const { error } = await sb.from("listings")
          .update({ status: "active", published_at: new Date().toISOString() })
          .eq("id", listing.id);
        if (error) throw error;
        showToast("Listing approved and published");
      } else if (action === "reject") {
        const { error } = await sb.from("listings").update({ status: "rejected" }).eq("id", listing.id);
        if (error) throw error;
        showToast("Listing rejected");
        closeDetails();
      }
      await refreshRemoteListings();
      if (action === "approve") openDetails(listing.id);
    } catch (err) {
      console.error("Moderation failed:", err);
      showToast(`Action failed: ${String(err && err.message || err).slice(0, 120)}`);
    }
  }

  function closeDetails() {
    els.detailPanel.classList.remove("is-open");
    els.detailPanel.setAttribute("aria-hidden", "true");
    state.selectedId = null;
  }

  function toggleFavorite(id, keepDetailOpen = false) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    localStorage.setItem("skillona-favorites", JSON.stringify([...state.favorites]));
    updateFavoriteCount();
    renderListingCards(state.visibleListings);
    if (keepDetailOpen && state.selectedId) openDetails(state.selectedId, false);
    showToast(state.favorites.has(id) ? "Property saved" : "Property removed from saved list");
  }

  function showFavorites() {
    state.searchTerm = "";
    els.searchInput.value = "";
    const favorites = state.allListings.filter(item => state.favorites.has(item.id));
    state.visibleListings = favorites;
    renderListingCards(favorites);
    renderGlobeListings(favorites);
    els.resultCount.textContent = `${favorites.length} saved ${favorites.length === 1 ? "property" : "properties"}`;
    els.resultContext.textContent = "your shortlist";
    if (window.innerWidth <= 980) els.sidebar.classList.add("is-open");
  }

  function updateFavoriteCount() {
    els.favoriteCount.textContent = state.favorites.size;
  }

  function handleAuthButton() {
    if (state.session) {
      sb.auth.signOut();
      showToast("Signed out");
      return;
    }
    openAuth();
  }

  function openAuth(message) {
    if (!sb) { showToast("Database is not configured"); return; }
    els.modalBackdrop.hidden = false;
    els.authModal.hidden = false;
    els.authMessage.textContent = message || "";
    document.body.style.overflow = "hidden";
    setTimeout(() => els.authForm.elements.email.focus(), 10);
  }

  function closeAuth() {
    if (!els.authModal) return;
    els.authModal.hidden = true;
    if (els.addListingModal.hidden) els.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  async function handleAuth(event, mode) {
    event.preventDefault();
    const email = els.authForm.elements.email.value.trim();
    const password = els.authForm.elements.password.value;
    if (!email || password.length < 6) {
      els.authMessage.textContent = "Enter your email and a password of at least 6 characters.";
      return;
    }
    els.authMessage.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          els.authForm.reset();
          closeAuth();
          showToast("Account created — you are signed in");
        } else {
          els.authMessage.textContent = "Check your email and confirm your address, then sign in here.";
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        els.authForm.reset();
        closeAuth();
        showToast("Signed in");
      }
    } catch (err) {
      els.authMessage.textContent = friendlyAuthError(err);
    }
  }

  function friendlyAuthError(err) {
    const msg = String(err && err.message || err);
    if (/invalid login credentials/i.test(msg)) return "Wrong email or password, or the account does not exist yet.";
    if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox.";
    if (/already registered/i.test(msg)) return "This email already has an account — use Sign in.";
    return msg;
  }

  function openAddListing() {
    if (sb && !state.session) {
      openAuth("Sign in or create an account to publish a listing.");
      return;
    }
    els.modalBackdrop.hidden = false;
    els.addListingModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => els.addListingForm.elements.title.focus(), 10);
  }

  function closeAddListing() {
    els.modalBackdrop.hidden = true;
    els.addListingModal.hidden = true;
    document.body.style.overflow = "";
  }

  async function submitListing(event) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const latitude = Number(form.get("latitude"));
    const longitude = Number(form.get("longitude"));

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      showToast("Enter valid latitude and longitude coordinates");
      return;
    }

    if (!sb) {
      showToast("Database is not configured");
      return;
    }
    if (!state.session) {
      openAuth("Sign in to publish a listing.");
      return;
    }

    const userId = state.session.user.id;
    els.publishButton.disabled = true;
    els.publishButton.textContent = "Publishing…";

    try {
      // 1) Upload photo if provided
      let imageUrl = String(form.get("image") || "").trim();
      const photo = form.get("photo");
      if (photo && photo.size > 0) {
        if (photo.size > 8 * 1024 * 1024) throw new Error("Photo is too large (max 8 MB).");
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("listing-photos").upload(path, photo, {
          contentType: photo.type || "image/jpeg",
          upsert: false
        });
        if (upErr) throw upErr;
        imageUrl = sb.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
      }

      // 2) Insert the listing (location as WKT point; latitude/longitude are computed by the database)
      const { data: inserted, error: insErr } = await sb.from("listings").insert({
        user_id: userId,
        title: String(form.get("title")).trim(),
        country: String(form.get("country")).trim(),
        city: String(form.get("city")).trim(),
        location: `SRID=4326;POINT(${longitude} ${latitude})`,
        property_type: form.get("type"),
        transaction_type: form.get("transaction") === "sale" ? "sale" : "long_term_rent",
        price: Number(form.get("price")),
        currency: "EUR",
        interior_area: Number(form.get("area")),
        bedrooms: Number(form.get("bedrooms") || 0),
        bathrooms: Number(form.get("bathrooms") || 0),
        sea_view: form.get("coastal") === "on",
        description: String(form.get("description")).trim(),
        status: "pending_review"
      }).select("id").single();
      if (insErr) throw insErr;

      // 3) Attach the image
      if (imageUrl) {
        const { error: imgErr } = await sb.from("listing_images").insert({
          listing_id: inserted.id,
          file_url: imageUrl,
          is_primary: true,
          sort_order: 0
        });
        if (imgErr) console.error("Image record failed:", imgErr);
      }

      formEl.reset();
      closeAddListing();
      await refreshRemoteListings();
      resetFilters();
      openDetails(inserted.id, true);
      showToast("Listing submitted — it goes live after moderator approval");
    } catch (err) {
      console.error("Publishing failed:", err);
      showToast(`Publishing failed: ${String(err && err.message || err).slice(0, 120)}`);
    } finally {
      els.publishButton.disabled = false;
      els.publishButton.textContent = "Publish listing";
    }
  }

  function flyTo(longitude, latitude, height) {
    if (!state.viewer) return;
    state.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(Number(longitude), Number(latitude), height),
      duration: reducedMotion ? 0 : 1.6
    });
  }

  function viewWorld(animate = true) {
    if (!state.viewer) return;
    const destination = Cesium.Cartesian3.fromDegrees(15, 25, 20500000);
    if (animate) state.viewer.camera.flyTo({ destination, duration: reducedMotion ? 0 : 1.8 });
    else state.viewer.camera.setView({ destination });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
  }

  function formatPrice(listing) {
    const suffix = listing.transaction === "rent" ? " / month" : "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: listing.currency || "EUR",
      maximumFractionDigits: 0
    }).format(listing.price) + suffix;
  }

  function formatCompactPrice(listing) {
    const symbol = listing.currency === "USD" ? "$" : listing.currency === "GBP" ? "£" : "€";
    const value = listing.price >= 1000000
      ? `${(listing.price / 1000000).toFixed(listing.price % 1000000 === 0 ? 0 : 1)}M`
      : listing.price >= 1000
        ? `${Math.round(listing.price / 1000)}k`
        : String(listing.price);
    return `${symbol}${value}${listing.transaction === "rent" ? "/mo" : ""}`;
  }

  function numberFormat(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
  }

  function labelType(type) {
    return ({ house: "House", villa: "Villa", apartment: "Apartment", land: "Land", commercial: "Commercial" })[type] || "Property";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
