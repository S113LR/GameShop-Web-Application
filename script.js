// ===== EmailJS configuration =====
const EMAILJS_PUBLIC_KEY = "zvHDGBvlPSNeb3nW9";
const EMAILJS_SERVICE_ID = "service_ityhmyr";
const EMAILJS_TEMPLATE_ID = "template_b9zp1p9";
// Public https:// link to your logo PNG (emails can't load images from localhost).
// Example: "https://your-site.com/images/ninexpo-logo.png"
const EMAILJS_LOGO_URL = "";
const EMAILJS_TIMEOUT_MS = 20000;
const MAX_CART_QUANTITY = 99;

// ===== SHOP LOCATION, DELIVERY ESTIMATE & PROMO CODES =====
const SHOP_ADDRESS = 'Catbangen, San Fernando, La Union, Philippines';
const PROMO_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid mix-ups

function generatePromoCode() {
    const bytes = new Uint8Array(15);
    crypto.getRandomValues(bytes);
    const chars = [...bytes].map(byte => PROMO_CODE_ALPHABET[byte % PROMO_CODE_ALPHABET.length]);
    return [chars.slice(0, 5), chars.slice(5, 10), chars.slice(10, 15)].map(group => group.join('')).join('-');
}

// One unique code for every copy bought
function generatePromoCodes(count) {
    const codes = new Set();
    while (codes.size < count) codes.add(generatePromoCode());
    return [...codes];
}

function normalizePlace(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\b(city|municipality|of|province)\b/g, '')
        .replace(/[^a-z]/g, '');
}

// Delivery time (in business days) from the shop in Catbangen, San Fernando, La Union
function getDeliveryBusinessDays() {
    const country = normalizePlace(currentUserData.country);
    const province = normalizePlace(currentUserData.province);
    const city = normalizePlace(currentUserData.city);
    const inPhilippines = country.includes('philippines') || country === 'ph' || country === 'pilipinas';
    if (!inPhilippines) return [7, 14];
    if (province === 'launion') return city === 'sanfernando' ? [1, 2] : [2, 3];
    return [3, 7];
}

function buildDeliveryEstimate(items, createdAt) {
    const parts = [];
    if (items.some(item => item.deliveryMode === 'physical')) {
        const [minDays, maxDays] = getDeliveryBusinessDays();
        const orderDate = new Date(createdAt);
        const earliest = formatDate(addBusinessDays(orderDate, minDays));
        const latest = formatDate(addBusinessDays(orderDate, maxDays));
        parts.push(`Disc/Card orders ship from ${SHOP_ADDRESS} and should arrive between ${earliest} and ${latest}.`);
    }
    if (items.some(item => item.deliveryMode !== 'physical')) {
        parts.push('Promo codes are delivered to your email right after checkout.');
    }
    return parts.join(' ');
}

if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
} else {
    console.error('EmailJS library failed to load.');
}

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendReceiptEmail({ email, name, orderId, items, total, paymentMethod, address, deliveryEstimate, createdAt }) {
    if (typeof emailjs === 'undefined') throw new Error('EmailJS library is not loaded.');
    if (EMAILJS_SERVICE_ID.startsWith('YOUR_') || EMAILJS_TEMPLATE_ID.startsWith('YOUR_')) {
        throw new Error('EmailJS Service ID / Template ID are not configured.');
    }

    const formatLabel = item => (item.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code');
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    // One row per game: the template loops over this list with {{#orders}} ... {{/orders}}
    const orders = items.map(item => ({
        name: item.title,
        platform: platformBranding[item.platform]?.name || item.platform,
        format: formatLabel(item),
        units: item.quantity,
        unit_price: formatCurrency(item.price),
        line_total: formatCurrency(item.price * item.quantity)
    }));

    // One entry per promo code (digital copies only); the email shows each one in a big box
    const promoCodes = items
        .filter(item => item.deliveryMode !== 'physical')
        .flatMap(item => (item.promoCodes || []).map(code => ({
            game: item.title,
            platform: platformBranding[item.platform]?.name || item.platform,
            code
        })));

    // Plain-text version, only used if a template still relies on {{order_items}}
    const itemLines = items.map(item =>
        `${item.title} x${item.quantity} (${formatLabel(item)}) - ${formatCurrency(item.price * item.quantity)}`
    ).join('\n');

    const request = emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        to_name: name,
        order_id: orderId,
        order_date: new Date(createdAt).toLocaleString(),
        orders,
        item_count: itemCount,
        order_items: itemLines,
        order_total: formatCurrency(total),
        payment_method: paymentMethod.toUpperCase(),
        ship_to: address,
        delivery_estimate: deliveryEstimate,
        promo_codes: promoCodes,
        ship_from: SHOP_ADDRESS,
        logo_url: EMAILJS_LOGO_URL,
        site_name: 'NinExpo eShop'
    });
    return withTimeout(request, EMAILJS_TIMEOUT_MS, 'The email service took too long to respond.');
}

// =========================================================================
// PAGE TRANSITIONS: the main view animates in whenever the player changes page
// (dashboard, a catalog, another platform), and dialogs animate out when closed.
// Skipped entirely for people who prefer reduced motion.
// =========================================================================
const pageMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const PAGE_ENTER_FRAMES = {
    home: [
        { opacity: 0, transform: 'translateY(18px) scale(0.99)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' }
    ],
    catalog: [
        { opacity: 0, transform: 'translateX(28px)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' }
    ],
    platform: [
        { opacity: 0, transform: 'translateY(26px) scale(0.985)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' }
    ]
};
const PAGE_ENTER_PRIORITY = { catalog: 1, home: 2, platform: 3 };
let pendingPageEnter = null;
let activePageAnimations = [];

// Navigation functions call each other (e.g. a hub card switches platform and opens the
// catalog), so requests within one frame are merged and the most significant one plays
function playPageEnter(kind) {
    if (pageMotionQuery.matches) return;
    if (!pendingPageEnter || PAGE_ENTER_PRIORITY[kind] > PAGE_ENTER_PRIORITY[pendingPageEnter]) {
        pendingPageEnter = kind;
    }
    if (playPageEnter.frame) return;
    playPageEnter.frame = requestAnimationFrame(() => {
        playPageEnter.frame = 0;
        const frames = PAGE_ENTER_FRAMES[pendingPageEnter];
        const duration = pendingPageEnter === 'catalog' ? 440 : 560;
        pendingPageEnter = null;
        activePageAnimations.forEach(animation => animation.cancel());
        activePageAnimations = ['home-dashboard-view', 'searchStatus', 'wishlistHeader', 'gamesContainer']
            .map(id => document.getElementById(id))
            .filter(element => element && !element.classList.contains('hidden'))
            .map(element => element.animate(frames, { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }));
    });
}

// A sweep of the new platform's color (with a faint flash of its logo) across the shop
function playPlatformWipe(platform) {
    if (pageMotionQuery.matches) return;
    const main = document.querySelector('.main-content');
    if (!main) return;
    let wipe = document.getElementById('platformWipe');
    if (!wipe) {
        wipe = document.createElement('div');
        wipe.id = 'platformWipe';
        wipe.className = 'platform-wipe';
        wipe.setAttribute('aria-hidden', 'true');
        wipe.innerHTML = '<span class="platform-wipe-band"></span><img class="platform-wipe-logo" alt="">';
        main.appendChild(wipe);
    }
    wipe.querySelector('.platform-wipe-logo').src = platformBranding[platform]?.logo || '';
    wipe.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    wipe.querySelector('.platform-wipe-band').animate(
        [{ transform: 'translateX(-100%)', opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.65 }, { transform: 'translateX(100%)', opacity: 0 }],
        { duration: 720, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
    );
    wipe.querySelector('.platform-wipe-logo').animate(
        [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.7)' }, { opacity: 0.22, offset: 0.4 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.15)' }],
        { duration: 720, easing: 'ease-out' }
    );
}

// Fades and sinks a dialog away, then hides it. Reopening the dialog mid-way cancels this.
function closeDialogAnimated(dialog, onClosed) {
    if (!dialog || dialog.classList.contains('hidden')) {
        onClosed?.();
        return;
    }
    if (dialog.closingAnimations) return;
    const panel = dialog.firstElementChild;
    if (pageMotionQuery.matches || !panel) {
        dialog.classList.add('hidden');
        onClosed?.();
        return;
    }
    const options = { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' };
    const animations = [
        dialog.animate([{ opacity: 1 }, { opacity: 0 }], options),
        panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(0.97)' }], options)
    ];
    dialog.closingAnimations = animations;
    const finishClose = () => {
        // Skip if this close was cancelled (dialog reopened) or has already finished
        if (dialog.closingAnimations !== animations) return;
        dialog.closingAnimations = null;
        dialog.classList.add('hidden');
        animations.forEach(animation => animation.cancel());
        onClosed?.();
    };
    Promise.all(animations.map(animation => animation.finished)).then(finishClose).catch(() => {
        // Cancelled because the dialog was opened again
    });
    // Browsers pause animations in background tabs; make sure the dialog still closes
    setTimeout(finishClose, 400);
}

// Call before showing a dialog so a close that is still animating does not hide it again
function cancelDialogClose(dialog) {
    if (!dialog?.closingAnimations) return;
    const animations = dialog.closingAnimations;
    dialog.closingAnimations = null;
    animations.forEach(animation => animation.cancel());
}

function showHomeDashboard() {
    document.body.classList.add('dashboard-home');
    document.getElementById('shop-screen')?.classList.add('dashboard-home');
    document.getElementById('home-dashboard-view')?.classList.remove('hidden');
    document.getElementById('gamesContainer')?.classList.add('hidden');
    document.getElementById('homeNavButton')?.setAttribute('aria-current', 'page');
    document.getElementById('homeNavButton')?.classList.add('active');
    activeGenre = 'All';
    resetGameSearch();
    closeWishlistView();
    document.querySelectorAll('.genre-btn[data-genre]').forEach(button => {
        button.classList.toggle('active', button.dataset.genre === activeGenre);
    });
    renderHomeHighlightsDeck();
    renderGameCorner();
    document.getElementById('home-dashboard-view')?.scrollTo({ top: 0 });
    playPageEnter('home');
}

function hideHomeDashboard() {
    document.body.classList.remove('dashboard-home');
    document.getElementById('shop-screen')?.classList.remove('dashboard-home');
    document.getElementById('home-dashboard-view')?.classList.add('hidden');
    document.getElementById('gamesContainer')?.classList.remove('hidden');
    document.getElementById('homeNavButton')?.removeAttribute('aria-current');
    document.getElementById('homeNavButton')?.classList.remove('active');
}

let mobileNavCloseTimer = null;
const mobileNavCloseDelay = 4000;

function closeMobileNavigation() {
    if (mobileNavCloseTimer) {
        clearTimeout(mobileNavCloseTimer);
        mobileNavCloseTimer = null;
    }
    const shopScreen = document.getElementById('shop-screen');
    const toggle = document.getElementById('mobileNavToggle');
    shopScreen?.classList.remove('mobile-nav-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
}

function scheduleMobileNavigationClose(delay = mobileNavCloseDelay) {
    if (!window.matchMedia('(max-width: 760px)').matches) return;
    if (mobileNavCloseTimer) clearTimeout(mobileNavCloseTimer);
    mobileNavCloseTimer = setTimeout(closeMobileNavigation, delay);
}

function toggleMobileNavigation() {
    const shopScreen = document.getElementById('shop-screen');
    const toggle = document.getElementById('mobileNavToggle');
    const isOpen = shopScreen?.classList.toggle('mobile-nav-open');
    toggle?.setAttribute('aria-expanded', String(Boolean(isOpen)));
    toggle?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    if (isOpen) {
        scheduleMobileNavigationClose();
    } else {
        closeMobileNavigation();
    }
}

function navigateToHomeCatalog() {
    hideHomeDashboard();
    activeGenre = 'All';
    resetGameSearch();
    closeWishlistView();
    document.querySelectorAll('.genre-btn[data-genre]').forEach(button => {
        button.classList.toggle('active', button.dataset.genre === activeGenre);
    });
    displayGames(currentCatalog);
    playPageEnter('catalog');
}

function navigateToPlatformCatalog(platform) {
    activeGenre = 'All';
    switchPlatformEcosystem(platform);
    hideHomeDashboard();
}

// The three most famous games for each platform, shown on the home dashboard
const DASHBOARD_TOP_PICKS = [
    ['switch', 'The Legend of Zelda: Tears of the Kingdom'], ['switch', 'Mario Kart 8 Deluxe'], ['switch', 'Super Mario Odyssey'],
    ['psp', "Marvel's Spider-Man 2"], ['psp', 'God of War Ragnarök'], ['psp', 'The Last of Us Part II'],
    ['xbox', 'Halo Infinite'], ['xbox', 'Forza Horizon 5'], ['xbox', 'Gears of War: E-Day']
];

function renderHomeHighlightsDeck() {
    const deckContainer = document.getElementById('featuredHighlightsDeck');
    if (!deckContainer) return;
    const highlightItems = getAllPlatformGames();
    const gameCount = document.getElementById('dashboardGameCount');
    if (gameCount) gameCount.textContent = `Browse all ${highlightItems.length} games`;
    const topPicks = DASHBOARD_TOP_PICKS
        .map(([platform, title]) => highlightItems.find(game => game.platform === platform && game.title === title))
        .filter(Boolean);
    featuredGames = FEATURED_ROTATION
        .map(([platform, title]) => highlightItems.find(game => game.platform === platform && game.title === title))
        .filter(Boolean);
    if (!featuredGames.length && highlightItems[0]) featuredGames = [highlightItems[0]];
    // Warm the cache so each slide's cover art is ready before it slides in
    featuredGames.forEach(game => {
        new Image().src = getFeaturedArtPath(game);
    });
    featuredIndex = featuredIndex % Math.max(featuredGames.length, 1);
    renderFeaturedDots();
    showFeaturedGame(featuredIndex, false);
    scheduleFeaturedRotation();
    const platformCounts = highlightItems.reduce((counts, game) => {
        counts[game.platform] = (counts[game.platform] || 0) + 1;
        return counts;
    }, {});
    document.querySelectorAll('[data-platform-count]').forEach(element => {
        element.textContent = platformCounts[element.dataset.platformCount] || 0;
    });
    deckContainer.innerHTML = '';
    
    topPicks.forEach((game, index) => {
        const rowTile = document.createElement('div');
        rowTile.className = 'game-card';
        rowTile.dataset.gameId = String(game.id);
        rowTile.dataset.platform = game.platform;
        rowTile.style.setProperty('--reveal-delay', `${Math.min(index % 12 * 25, 300)}ms`);
        rowTile.tabIndex = 0;
        rowTile.setAttribute('role', 'button');
        rowTile.setAttribute('aria-haspopup', 'dialog');
        rowTile.setAttribute('aria-label', `View details for ${game.title}`);
        rowTile.innerHTML = `
            <div class="box-art-wrapper" style="background: linear-gradient(135deg, ${game.color} 0%, #111 100%)">
                <img class="box-art-img" src="${getGameImagePath(game.artworkPlatform || game.platform || currentPlatform, game.image)}" alt="${game.title} cover art" loading="lazy">
            </div>
            <div class="game-details">
                <div>
                    <div class="game-platform-label ${platformBranding[game.platform]?.theme || ''}">${platformBranding[game.platform]?.name || game.platform}</div>
                    <div class="game-genre">${game.genre}</div>
                    <div class="game-title">${game.title}</div>
                </div>
                <div class="game-footer">
                    <span class="game-price">${formatCurrency(game.price)}</span>
                </div>
            </div>
        `;
        rowTile.addEventListener('click', () => {
            openHomeGameDetails(game);
        });
        rowTile.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openHomeGameDetails(game);
            }
        });
        rowTile.querySelector('.box-art-img').addEventListener('error', event => {
            const image = event.currentTarget;
            if (image.dataset.fallbackApplied === 'true') {
                image.classList.add('image-missing');
                return;
            }
            image.dataset.fallbackApplied = 'true';
            image.src = getGameImagePath('switch', game.image);
        });
        deckContainer.appendChild(rowTile);
    });
}

// =========================================================================
// FEATURED GAME HERO: rotates through Splatoon 3 and the top picks every few seconds.
// Pauses while hovered or keyboard-focused, while the home page or browser tab is
// hidden, and never auto-rotates for people who prefer reduced motion.
// =========================================================================
const FEATURED_ROTATION = [['switch', 'Splatoon 3'], ...DASHBOARD_TOP_PICKS];
const FEATURED_ROTATION_MS = 5000;
// Wide artwork from images/featured_games that fills the whole hero. Games not listed
// here (Splatoon 3, Forza Horizon 5) already have landscape store art, which is reused.
const FEATURED_LANDSCAPE_ART = {
    'The Legend of Zelda: Tears of the Kingdom': 'zelda_totk_landscape.jpg',
    'Mario Kart 8 Deluxe': 'Mario-Kart-8-Deluxe.jpg',
    'Super Mario Odyssey': 'Super-Mario-Odyssey.jpg',
    "Marvel's Spider-Man 2": 'marvels-spider-man-2-.jpg',
    'God of War Ragnarök': 'god_of_war_ragnarok.jpg',
    'The Last of Us Part II': 'the_last_of_us_2.jpg',
    'Halo Infinite': 'halo_infinite.jpg',
    'Gears of War: E-Day': 'gears_of_war_eday.jpg'
};

function getFeaturedArtPath(game) {
    const landscapeFile = FEATURED_LANDSCAPE_ART[game.title];
    return landscapeFile
        ? `images/featured_games/${encodeURIComponent(landscapeFile)}`
        : getGameImagePath(game.artworkPlatform || game.platform, game.image);
}
const featuredReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let featuredGames = [];
let featuredIndex = 0;
let featuredTimer = null;
let featuredProgress = null;
let featuredPaused = false;
let featuredTransition = 0;

function fillFeaturedHero(game) {
    const platform = game.platform || currentPlatform;
    const platformName = platformBranding[platform]?.name || platform;
    setPlatformThemeClass(document.getElementById('featuredHero'), platform);
    document.getElementById('featuredGameTitle').textContent = game.title;
    document.getElementById('featuredGamePlatform').textContent = `${platformName} · ${game.genre}`;
    document.getElementById('featuredGameDescription').textContent = game.details?.synopsis
        || `Discover ${game.title} and more games in the ${platformName} collection.`;
    const image = document.getElementById('featuredGameImage');
    image.src = getFeaturedArtPath(game);
    image.alt = `${game.title} artwork`;
    document.getElementById('featuredGameDetailsButton').onclick = () => openHomeGameDetails(game);
}

function renderFeaturedDots() {
    const dots = document.getElementById('featuredDots');
    if (!dots) return;
    dots.innerHTML = featuredGames.length < 2 ? '' : featuredGames.map((game, index) => `
        <button type="button" class="hero-dot" data-featured-index="${index}" aria-label="Show ${escapeHtml(game.title)}">
            <span class="hero-dot-track"><span class="hero-dot-fill"></span></span>
        </button>
    `).join('');
}

function updateFeaturedDots() {
    document.querySelectorAll('#featuredDots .hero-dot').forEach(dot => {
        const isActive = Number(dot.dataset.featuredIndex) === featuredIndex;
        if (isActive) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
    });
}

function showFeaturedGame(index, animate = true) {
    const game = featuredGames[index];
    if (!game) return;
    featuredIndex = index;
    updateFeaturedDots();
    const content = document.querySelector('.hero-banner-content');
    const image = document.getElementById('featuredGameImage');
    const transition = ++featuredTransition;
    if (!animate || featuredReducedMotion.matches || !content || !image) {
        fillFeaturedHero(game);
        return;
    }
    // The text slides out left and the next one in from the right; the full-width
    // artwork fades through black (sliding it would expose the hero's empty edges)
    const exits = [
        content.animate(
            [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-28px)' }],
            { duration: 260, easing: 'ease-in', fill: 'forwards' }
        ),
        image.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: 260, easing: 'ease-in', fill: 'forwards' }
        )
    ];
    Promise.all(exits.map(animation => animation.finished)).then(() => {
        if (transition !== featuredTransition) return;
        fillFeaturedHero(game);
        content.animate(
            [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'translateX(0)' }],
            { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
        image.animate(
            [{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }],
            { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
        exits.forEach(animation => animation.cancel());
    }).catch(() => {
        // A newer slide change cancelled this one
    });
}

function isFeaturedHeroVisible() {
    return !document.hidden
        && !document.getElementById('shop-screen')?.classList.contains('hidden')
        && !document.getElementById('home-dashboard-view')?.classList.contains('hidden')
        && document.getElementById('loadingOverlay')?.classList.contains('hidden');
}

function scheduleFeaturedRotation() {
    clearTimeout(featuredTimer);
    featuredProgress?.cancel();
    featuredTimer = null;
    featuredProgress = null;
    if (featuredGames.length < 2 || featuredPaused || featuredReducedMotion.matches) return;
    // Off-screen (signing in, another page, background tab): wait until the hero is
    // visible again, then give the current game its full turn
    if (!isFeaturedHeroVisible()) {
        featuredTimer = setTimeout(scheduleFeaturedRotation, 500);
        return;
    }
    // The active dot fills up as the countdown to the next game runs
    featuredProgress = document.querySelector('#featuredDots .hero-dot[aria-current] .hero-dot-fill')
        ?.animate([{ width: '0%' }, { width: '100%' }], { duration: FEATURED_ROTATION_MS, easing: 'linear' }) || null;
    featuredTimer = setTimeout(() => {
        if (isFeaturedHeroVisible()) showFeaturedGame((featuredIndex + 1) % featuredGames.length);
        scheduleFeaturedRotation();
    }, FEATURED_ROTATION_MS);
}

function setFeaturedPaused(paused) {
    if (featuredPaused === paused) return;
    featuredPaused = paused;
    scheduleFeaturedRotation();
}

const featuredHero = document.getElementById('featuredHero');
featuredHero?.addEventListener('mouseenter', () => setFeaturedPaused(true));
featuredHero?.addEventListener('mouseleave', () => {
    if (!featuredHero.querySelector(':focus-visible')) setFeaturedPaused(false);
});
// Keyboard users get a pause while tabbing through the hero; a mouse click does not hold it paused
featuredHero?.addEventListener('focusin', event => {
    if (event.target.matches(':focus-visible')) setFeaturedPaused(true);
});
featuredHero?.addEventListener('focusout', event => {
    if (!featuredHero.contains(event.relatedTarget) && !featuredHero.matches(':hover')) setFeaturedPaused(false);
});
document.getElementById('featuredDots')?.addEventListener('click', event => {
    const dot = event.target.closest('.hero-dot');
    if (!dot) return;
    const index = Number(dot.dataset.featuredIndex);
    if (index !== featuredIndex) showFeaturedGame(index);
    scheduleFeaturedRotation();
});
document.addEventListener('visibilitychange', scheduleFeaturedRotation);
featuredReducedMotion.addEventListener?.('change', scheduleFeaturedRotation);

function openHomeGameDetails(game) {
    if (!game) return;
    const card = document.createElement('div');
    card.dataset.gameId = String(game.id);
    card.dataset.platform = game.platform;
    openGameDetails(card);
}

// "Browse by platform" cards: a press and a ring of light from the click point play
// briefly before the catalog opens (instantly for people who prefer reduced motion)
const HUB_CARD_CLICK_MS = 380;
document.querySelectorAll('.hub-promo-card[data-platform]').forEach(card => {
    card.addEventListener('click', event => {
        const platform = card.dataset.platform;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            navigateToPlatformCatalog(platform);
            return;
        }
        if (card.dataset.opening === 'true') return;
        card.dataset.opening = 'true';
        const rect = card.getBoundingClientRect();
        // Keyboard "clicks" (Enter/Space) have no pointer position, so start from the center
        const fromPointer = event.detail > 0;
        const x = fromPointer ? event.clientX - rect.left : rect.width / 2;
        const y = fromPointer ? event.clientY - rect.top : rect.height / 2;
        const size = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y)) * 2;
        const ring = document.createElement('span');
        ring.className = 'hub-click-ring';
        ring.setAttribute('aria-hidden', 'true');
        ring.style.cssText = `left:${x}px; top:${y}px; width:${size}px; height:${size}px;`;
        card.appendChild(ring);
        ring.animate(
            [{ transform: 'translate(-50%, -50%) scale(0)', opacity: 0.55 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }],
            { duration: HUB_CARD_CLICK_MS + 140, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );
        card.animate(
            [{ scale: '1' }, { scale: '0.97' }, { scale: '1.01' }, { scale: '1' }],
            { duration: HUB_CARD_CLICK_MS, easing: 'ease-out' }
        );
        setTimeout(() => {
            ring.remove();
            delete card.dataset.opening;
            navigateToPlatformCatalog(platform);
        }, HUB_CARD_CLICK_MS);
    });
});

document.querySelectorAll('.hub-promo-card').forEach(card => {
    card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            card.click();
        }
    });
});

const mobileNavToggle = document.getElementById('mobileNavToggle');
const shopSidebar = document.getElementById('shopSidebar');
const shopScreen = document.getElementById('shop-screen');
mobileNavToggle?.addEventListener('click', toggleMobileNavigation);
shopSidebar?.addEventListener('click', event => {
    if (event.target.closest('button')) scheduleMobileNavigationClose(450);
});
shopSidebar?.addEventListener('pointermove', () => scheduleMobileNavigationClose());
shopSidebar?.addEventListener('focusin', () => scheduleMobileNavigationClose());
shopScreen?.addEventListener('click', event => {
    if (event.target === shopScreen && shopScreen.classList.contains('mobile-nav-open')) {
        closeMobileNavigation();
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMobileNavigation();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', event => {
    if (event.matches) closeMobileNavigation();
});


// Ensure the application default redirects into Home panel viewport automatically on login entry
const originalEnterLocalAccount = enterLocalAccount;
enterLocalAccount = function(email) {
    originalEnterLocalAccount(email);
    showHomeDashboard();
};



const gamesData = [
    { id: 5, title: "Mario Kart 8 Deluxe", genre: "Party-Racing", price: 59.99, image: "MarioKart8Deluxe.jpg", color: "#152a5e" },
    { id: 6, title: "Animal Crossing: New Horizons", genre: "Simulation", price: 59.99, image: "AnimalCrossing.jpg", color: "#256338" },
    { id: 1, title: "The Legend of Zelda: Breath of the Wild", genre: "Action-Adventure", price: 59.99, image: "legendsofzeldabotw.jpg", color: "#164e4e" },
    { id: 3, title: "Super Mario Odyssey", genre: "Platformer", price: 59.99, image: "SuperMarioOdyssey.jpg", color: "#9c1212" },
    { id: 7, title: "Super Smash Bros. Ultimate", genre: "Action-Adventure", price: 59.99, image: "supermsmashbrosultimate.jpg", color: "#362d29" },
    { id: 2, title: "The Legend of Zelda: Tears of the Kingdom", genre: "Action-Adventure", price: 69.99, image: "legendsofzeldatotk.jpg", color: "#0b3d2e" },
    { id: 8, title: "Pokémon Scarlet", genre: "RPG", price: 59.99, image: "PokémonScarlet.jpg", color: "#731414" },
    { id: 9, title: "Pokémon Violet", genre: "RPG", price: 59.99, image: "PokémonViolet.jpg", color: "#3d1b6b" },
    { id: 4, title: "Super Mario Bros. Wonder", genre: "Platformer", price: 59.99, image: "SuperMarioBros.Wonder.jpg", color: "#125da1" },
    { id: 19, title: "Super Mario Party", genre: "Party-Racing", price: 49.99, image: "SuperMarioParty.jpg", color: "#b52121" },
    { id: 10, title: "Pokémon Legends: Arceus", genre: "RPG", price: 59.99, image: "PokémonLegends.jpg", color: "#1f3347" },
    { id: 22, title: "Stardew Valley", genre: "Simulation", price: 14.99, image: "StardewValley.jpg", color: "#244970", additionalPlatforms: [{ theme: 'playstation', label: 'PS', details: 'Available on PlayStation 4; playable on PlayStation 5 through backward compatibility.' }, { theme: 'xbox', label: 'XBOX', details: 'Also available on Xbox consoles.' }] },
    { id: 23, title: "EA SPORTS FC 27", genre: "Party-Racing", price: 69.99, image: "ea_sports_fc.jpg", artworkPlatform: 'psp', color: "#18723b", additionalPlatforms: [{ theme: 'playstation', label: 'PS', details: 'EA SPORTS FC 27 is available on PlayStation 4 and PlayStation 5.' }, { theme: 'xbox', label: 'XBOX', details: 'EA SPORTS FC 27 is available on Xbox One and Xbox Series X|S.' }] },
    { id: 11, title: "Splatoon 3", genre: "Action-Adventure", price: 59.99, image: "splatoon3.jpg", color: "#7a7d18" },
    { id: 13, title: "Luigi's Mansion 3", genre: "Action-Adventure", price: 59.99, image: "Luigi'sMansion3.jpg", color: "#184718" },
    { id: 14, title: "Kirby and the Forgotten Land", genre: "Platformer", price: 59.99, image: "KirbyandtheForgottenLand.jpg", color: "#9e476e" },
    { id: 15, title: "Donkey Kong Country: Tropical Freeze", genre: "Platformer", price: 49.99, image: "DonkeyKongCountry.jpg", color: "#47280e" },
    { id: 16, title: "Pikmin 4", genre: "Simulation", price: 59.99, image: "Pikmin4.jpg", color: "#5d7c1a" },
    { id: 17, title: "Super Mario Maker 2", genre: "Platformer", price: 59.99, image: "SuperMarioMaker2.jpg", color: "#a86c14" },
    { id: 18, title: "Paper Mario: The Thousand-Year Door", genre: "RPG", price: 59.99, image: "PaperMario.jpg", color: "#8f243e" },
    { id: 20, title: "Fire Emblem Engage", genre: "RPG", price: 59.99, image: "FireEmblemEngage.jpg", color: "#1a3869" },
    { id: 21, title: "Xenoblade Chronicles 3", genre: "RPG", price: 59.99, image: "XenobladeChronicles3.jpg", color: "#451a1a" },
    { id: 12, title: "Metroid Dread", genre: "Action-Adventure", price: 59.99, image: "MetroidDread.jpg", color: "#10141a" },
];

let shoppingCart = [];
const selectedDeliveryModes = new Map();
let currentPlatform = 'switch';
let currentCatalog = [];
let activeGenre = 'All';

let currentUserData = {
    id: null,
    name: "",
    email: "",
    age: null,
    country: "",
    province: "",
    city: "",
    barangay: "",
    avatarDataUrl: null
};
const LOCAL_ACCOUNTS_KEY = 'ninexpo.local.accounts.v1';
const LOCAL_SESSION_KEY = 'ninexpo.local.session.v1';
let activeLocalAccountEmail = null;
let stagedProfilePhoto = null;
let authMode = 'signin';
const currencyRates = {
    PHP: { rate: 62.641606, locale: 'en-PH' },
    USD: { rate: 1, locale: 'en-US' },
    IQD: { rate: 1311.824108, locale: 'en-IQ' },
    JPY: { rate: 157.982128, locale: 'ja-JP' },
    CNY: { rate: 6.714466, locale: 'zh-CN' },
    KRW: { rate: 1342.774629, locale: 'ko-KR' },
    EUR: { rate: 0.892111, locale: 'en-IE' }
};
let selectedCurrency = 'PHP';
let lastCompletedOrder = null;
const platformBranding = {
    switch: {
        name: 'Nintendo Switch',
        logo: 'images/nintendo-switch-seeklogo.png',
        theme: 'switch'
    },
    psp: {
        name: 'PlayStation',
        logo: 'images/playstation-seeklogo.png',
        theme: 'playstation'
    },
    playstation: {
        name: 'PlayStation',
        logo: 'images/playstation-seeklogo.png',
        theme: 'playstation'
    },
    xbox: {
        name: 'Xbox',
        logo: 'images/xbox-app-seeklogo.png',
        theme: 'xbox'
    }
};

function formatCurrency(usdAmount) {
    const currency = currencyRates[selectedCurrency];
    return new Intl.NumberFormat(currency.locale, {
        style: 'currency',
        currency: selectedCurrency
    }).format(usdAmount * currency.rate);
}

function updateCurrencyDisplays() {
    document.getElementById('currencyStatus').textContent = selectedCurrency;
    // Every price element carries its USD price, so cards from any platform (search results,
    // the wishlist) update too, not just the current store's catalog
    document.querySelectorAll('[data-usd-price]').forEach(priceElement => {
        const usdPrice = Number(priceElement.dataset.usdPrice);
        if (Number.isFinite(usdPrice)) {
            priceElement.textContent = formatCurrency(usdPrice);
        }
    });
    document.querySelectorAll('[data-membership-price]').forEach(priceElement => {
        priceElement.textContent = formatCurrency(Number(priceElement.dataset.membershipPrice));
    });
        if (!document.getElementById('home-dashboard-view')?.classList.contains('hidden')) {
        renderHomeHighlightsDeck();
    }
    renderCartListRows();
    if (lastCompletedOrder) {
        renderReceipt();
    }
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function readLocalAccounts() {
    let serialized;
    try {
        serialized = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    } catch (error) {
        throw new Error(`Browser storage is unavailable: ${error.message}`);
    }
    if (!serialized) return {};
    try {
        const accounts = JSON.parse(serialized);
        if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) {
            throw new Error('Stored account data has an invalid format.');
        }
        return accounts;
    } catch (error) {
        throw new Error(`Unable to read saved browser accounts: ${error.message}`);
    }
}

function writeLocalAccounts(accounts) {
    try {
        localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (error) {
        const reason = error.name === 'QuotaExceededError'
            ? 'Browser storage is full. Try a smaller profile photo or clear this site’s stored data.'
            : `Unable to save browser data: ${error.message}`;
        throw new Error(reason);
    }
}

function getActiveLocalAccount() {
    if (!activeLocalAccountEmail) return null;
    return readLocalAccounts()[activeLocalAccountEmail] || null;
}

function persistActiveLocalAccount() {
    if (!activeLocalAccountEmail) return;
    const accounts = readLocalAccounts();
    const account = accounts[activeLocalAccountEmail];
    if (!account) throw new Error('The active local account could not be found.');
    account.cart = shoppingCart;
    account.deliveryModes = Object.fromEntries(selectedDeliveryModes);
    account.currency = selectedCurrency;
    account.wishlist = [...wishlistKeys];
    writeLocalAccounts(accounts);
}

function displayGames(catalogList) {
    const viewList = Array.isArray(catalogList) ? catalogList : gamesData;
    renderStoreGridTiles(viewList);
}

function getGameImagePath(platform, filename) {
    const imageFolder = {
        switch: 'Nintendo_games',
        psp: 'Playstation',
        xbox: 'Xbox'
    }[platform] || 'Nintendo_games';

    return `images/${imageFolder}/${encodeURIComponent(filename)}`;
}

function renderStoreGridTiles(catalogList) {
    const container = document.getElementById('gamesContainer');
    if (!container) return;

    const gamesToRender = Array.isArray(catalogList) ? catalogList : currentCatalog;
    container.classList.remove('membership-grid');
    container.classList.add('games-grid');
    container.innerHTML = '';
    
    gamesToRender.forEach((game, index) => {
        const gamePlatform = game.platform || currentPlatform || 'switch';
        const platformBrand = platformBranding[gamePlatform] || {
            name: gamePlatform.toUpperCase(),
            logo: '',
            theme: ''
        };
        const cardId = String(game.id);
        const deliveryMode = selectedDeliveryModes.get(`${gamePlatform}:${cardId}`) || 'digital';
        const card = document.createElement('article');
        card.className = 'game-card';
        setPlatformThemeClass(card, gamePlatform);
        card.dataset.gameId = cardId;
        card.tabIndex = 0;
        card.setAttribute('aria-haspopup', 'dialog');
        card.setAttribute('aria-label', `View details for ${game.title}`);
        card.style.setProperty('--reveal-delay', `${Math.min(index * 25, 300)}ms`);
        card.innerHTML = `
            <div class="box-art-wrapper" style="background: linear-gradient(135deg, ${game.color} 0%, #111 100%)">
                <img class="box-art-img" src="${getGameImagePath(game.artworkPlatform || gamePlatform, game.image)}" alt="${game.title} cover art" tabindex="-1" loading="lazy">
                ${renderWishlistHeart(game)}
                <div class="box-art-placeholder">
                    <div class="box-art-badges">
                        <div class="box-switch-banner ${platformBrand.theme}" title="${platformBrand.name}">
                            ${platformBrand.logo ? `<span class="platform-badge-mark"><img src="${platformBrand.logo}" alt="" aria-hidden="true"></span>` : ''}
                            <span class="visually-hidden">${platformBrand.name}</span>
                        </div>
                        ${(game.additionalPlatforms || []).map(platform => `
                            <div class="platform-availability-badge ${platform.theme}" title="${platform.details}" aria-label="${platform.details}">
                                ${platformBranding[platform.theme]?.logo ? `<span class="platform-badge-mark"><img src="${platformBranding[platform.theme].logo}" alt="" aria-hidden="true"></span>` : ''}
                                ${platform.label.includes('2') ? '<span class="platform-version">2</span>' : ''}
                                <span class="visually-hidden">${platform.label}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="game-details">
                <div>
                    <div class="game-genre">${game.genre}</div>
                    <div class="game-title">${game.title}</div>
                </div>
                
                <!-- DISTRIBUTION INTERACTION TOGGLES CHIPS -->
                <div class="delivery-options-group">
                    <button type="button" class="delivery-chip${deliveryMode === 'physical' ? ' active' : ''}" data-game-id="${cardId}" data-platform="${gamePlatform}" data-delivery-mode="physical" aria-pressed="${deliveryMode === 'physical'}" onclick="setGameDeliveryMode('${cardId}', 'physical', '${gamePlatform}')">📦 Disc/Card</button>
                    <button type="button" class="delivery-chip${deliveryMode === 'digital' ? ' active' : ''}" data-game-id="${cardId}" data-platform="${gamePlatform}" data-delivery-mode="digital" aria-pressed="${deliveryMode === 'digital'}" onclick="setGameDeliveryMode('${cardId}', 'digital', '${gamePlatform}')">🔑 Promo Code</button>
                </div>

                <div class="game-footer">
                    <span class="game-price" data-usd-price="${game.price}" data-game-id="${cardId}">${formatCurrency(game.price)}</span>
                    <button class="btn-buy" onclick="addItemToCart('${cardId}')">Add to Cart</button>
                </div>
            </div>
        `;
        const coverImage = card.querySelector('.box-art-img');
        coverImage.addEventListener('error', () => {
            if (coverImage.dataset.fallbackApplied === 'true') {
                coverImage.classList.add('image-missing');
                return;
            }

            coverImage.dataset.fallbackApplied = 'true';
            coverImage.src = getGameImagePath('switch', game.image);
        });
        container.appendChild(card);
    });
}


function displayMemberships() {
    const container = document.getElementById('gamesContainer');
    if (currentPlatform !== 'switch') {
        displayPlatformMemberships(container, currentPlatform);
        return;
    }

    const plans = [
        { name: 'Individual · 1 month', price: 3.99, term: '1 month', tier: 'Standard', audience: '1 Nintendo Account' },
        { name: 'Individual · 3 months', price: 7.99, term: '3 months', tier: 'Standard', audience: '1 Nintendo Account' },
        { name: 'Individual · 12 months', price: 19.99, term: '12 months', tier: 'Standard', audience: '1 Nintendo Account' },
        { name: 'Family · 12 months', price: 34.99, term: '12 months', tier: 'Standard', audience: 'Up to 8 Nintendo Accounts' },
        { name: 'Individual · 12 months', price: 49.99, term: '12 months', tier: 'Expansion Pack', audience: '1 Nintendo Account' },
        { name: 'Family · 12 months', price: 79.99, term: '12 months', tier: 'Expansion Pack', audience: 'Up to 8 Nintendo Accounts' }
    ];

    container.classList.remove('games-grid');
    container.classList.add('membership-grid');
    container.innerHTML = `
        <section class="membership-page" aria-labelledby="membership-title">
            <div class="membership-heading">
                <div>
                    <p class="membership-eyebrow">Online play, classic games &amp; more</p>
                    <h2 id="membership-title">Nintendo Switch Online</h2>
                    <p>Compare U.S. membership plans. Prices follow your selected display currency and use the storefront's approximate exchange rates.</p>
                </div>
                <a class="membership-source-link" href="https://www.nintendo.com/us/online/nintendo-switch-online/" target="_blank" rel="noopener noreferrer">Official Nintendo details</a>
            </div>
            <div class="membership-plan-grid">
                ${plans.map((plan, index) => `
                    <article class="membership-plan-card${plan.tier === 'Expansion Pack' ? ' expansion-plan' : ''}">
                        <span class="membership-tier">${plan.tier}</span>
                        <h3>${plan.name}</h3>
                        <p class="membership-audience">${plan.audience}</p>
                        <p class="membership-price" data-membership-price="${plan.price}">${formatCurrency(plan.price)}</p>
                        <p class="membership-term">per ${plan.term} · U.S. plan price</p>
                        <a href="${index < 4 ? 'https://www.nintendo.com/us/online/nintendo-switch-online/' : 'https://www.nintendo.com/us/online/nintendo-switch-online/expansion-pack/'}" target="_blank" rel="noopener noreferrer">Plan details</a>
                    </article>
                `).join('')}
            </div>
            <div class="membership-info-grid">
                <article class="membership-info-card">
                    <h3>Standard membership includes</h3>
                    <ul>
                        <li>Online play in compatible games</li>
                        <li>Save Data Cloud backup for supported games</li>
                        <li>Classic NES, Super NES, and Game Boy game libraries</li>
                        <li>Access to the official smart-device app and member benefits</li>
                    </ul>
                </article>
                <article class="membership-info-card">
                    <h3>Expansion Pack adds</h3>
                    <ul>
                        <li>Classic Nintendo 64, Game Boy Advance, SEGA Genesis, and Virtual Boy libraries</li>
                        <li>Access to select included DLC while membership is active; the full game is required</li>
                        <li>All standard Nintendo Switch Online benefits</li>
                    </ul>
                    <a href="https://www.nintendo.com/us/online/nintendo-switch-online/expansion-pack/" target="_blank" rel="noopener noreferrer">See Expansion Pack details</a>
                </article>
                <article class="membership-info-card membership-downloads">
                    <h3>What to download</h3>
                    <p>On your console, open Nintendo eShop and download the Nintendo Entertainment System, Super Nintendo Entertainment System, and Game Boy classic-game apps. Expansion Pack libraries have their own apps, including Nintendo 64, Game Boy Advance, SEGA Genesis, and Virtual Boy.</p>
                    <p>The smart-device app is optional and is only needed for its supported companion features. A Nintendo Account and internet access are required; compatible games and availability vary.</p>
                </article>
            </div>
            <p class="membership-disclaimer">U.S. prices are shown as a reference; membership availability, renewal, and final price depend on account region. Memberships may auto-renew, and free trials can convert to a paid plan. A Nintendo Account is required for online features. Review Nintendo's terms before purchasing.</p>
        </section>
    `;
}

function displayPlatformMemberships(container, platform) {
    const memberships = {
        psp: {
            service: 'PlayStation Plus',
            subtitle: 'Online play, game catalogs & classic titles',
            source: 'https://www.playstation.com/en-us/ps-plus/',
            plans: [
                { tier: 'Essential', price: 9.99, benefits: 'Online multiplayer, monthly games, and cloud storage' },
                { tier: 'Extra', price: 14.99, benefits: 'Essential benefits plus a catalog of downloadable games' },
                { tier: 'Premium', price: 17.99, benefits: 'Extra benefits plus classics, game trials, and cloud streaming' }
            ],
            note: 'PlayStation Plus Premium includes access to select classic PSP games. Catalog titles, features, and device compatibility vary by region and can change.'
        },
        xbox: {
            service: 'Xbox Game Pass',
            subtitle: 'A library of games, online play & cloud gaming',
            source: 'https://www.xbox.com/en-US/xbox-game-pass',
            plans: [
                { tier: 'Essential', price: 9.99, benefits: 'A curated game library, online console multiplayer, and cloud gaming' },
                { tier: 'Premium', price: 14.99, benefits: 'A larger library of games across console and PC, plus online multiplayer' },
                { tier: 'Ultimate', price: 29.99, benefits: 'The broadest catalog, select new releases, and expanded cloud benefits' }
            ],
            note: 'Game catalog, new-release timing, cloud features, and supported devices depend on plan and region and may change.'
        }
    }[platform];

    if (!memberships) {
        throw new Error(`No membership plans are configured for ${platform}.`);
    }

    container.classList.remove('games-grid');
    container.classList.add('membership-grid');
    container.innerHTML = `
        <section class="membership-page" aria-labelledby="membership-title">
            <div class="membership-heading">
                <div>
                    <p class="membership-eyebrow">Monthly subscription plans</p>
                    <h2 id="membership-title">${memberships.service}</h2>
                    <p>${memberships.subtitle} Prices follow your selected display currency using approximate exchange rates.</p>
                </div>
                <a class="membership-source-link" href="${memberships.source}" target="_blank" rel="noopener noreferrer">Official ${memberships.service} details</a>
            </div>
            <div class="membership-plan-grid">
                ${memberships.plans.map(plan => `
                    <article class="membership-plan-card">
                        <span class="membership-tier">${plan.tier}</span>
                        <h3>${plan.tier} · 1 month</h3>
                        <p class="membership-audience">1 account</p>
                        <p class="membership-price" data-membership-price="${plan.price}">${formatCurrency(plan.price)}</p>
                        <p class="membership-term">per month · U.S. reference price</p>
                        <p>${plan.benefits}</p>
                        <a href="${memberships.source}" target="_blank" rel="noopener noreferrer">Plan details</a>
                    </article>
                `).join('')}
            </div>
            <p class="membership-disclaimer">U.S. monthly prices are reference amounts and may change. Actual prices, taxes, availability, and renewal terms depend on your account region. Subscriptions generally renew automatically until canceled. ${memberships.note} Check the official plan details before subscribing.</p>
        </section>
    `;
}

// ----- Sign-in card motion: errors shake the card, switching modes unfolds the sign-up
// fields and fades the new heading in, and a successful sign-in lifts the card away -----
const authMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const AUTH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function setAuthMessage(message, isError = false) {
    const messageElement = document.getElementById('authMessage');
    messageElement.textContent = message;
    messageElement.classList.toggle('error', isError);
    if (!message || authMotionQuery.matches) return;
    messageElement.animate(
        [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: AUTH_EASE }
    );
    if (isError) {
        document.querySelector('.auth-card')?.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
            { duration: 420, easing: 'ease-out' }
        );
    }
}

// Unfolds (or folds away) the extra sign-up fields so the card resizes smoothly
function animateSignupFields(fields, show) {
    fields.revealAnimations?.forEach(animation => animation.cancel());
    fields.revealAnimations = null;
    if (authMotionQuery.matches) {
        fields.classList.toggle('hidden', !show);
        return;
    }
    if (show) {
        fields.classList.remove('hidden');
        const height = fields.scrollHeight;
        const unfold = fields.animate(
            [{ height: '0px', opacity: 0, overflow: 'hidden' }, { height: `${height}px`, opacity: 1, overflow: 'hidden' }],
            { duration: 420, easing: AUTH_EASE }
        );
        const cascade = [...fields.children].map((child, index) => child.animate(
            [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
            { duration: 380, delay: 60 + index * 55, easing: AUTH_EASE, fill: 'backwards' }
        ));
        fields.revealAnimations = [unfold, ...cascade];
    } else {
        if (fields.classList.contains('hidden')) return;
        const fold = fields.animate(
            [{ height: `${fields.offsetHeight}px`, opacity: 1, overflow: 'hidden' }, { height: '0px', opacity: 0, overflow: 'hidden' }],
            { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
        );
        fields.revealAnimations = [fold];
        fold.finished.then(() => {
            fields.classList.add('hidden');
            fold.cancel();
            fields.revealAnimations = null;
        }).catch(() => {
            // Switched back to sign-up before folding finished
        });
    }
}

// Lifts and fades the card away before the shop appears
function playAuthExit() {
    const card = document.querySelector('.auth-card');
    if (!card || authMotionQuery.matches) return Promise.resolve(null);
    const animation = card.animate(
        [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-14px) scale(0.97)', filter: 'blur(4px)' }],
        { duration: 340, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
    // Browsers pause animations in background tabs, so never hold up signing in for more than a moment
    const timeout = new Promise(resolve => setTimeout(resolve, 500));
    return Promise.race([animation.finished, timeout]).then(() => animation).catch(() => null);
}

function setAuthMode(mode, { animate = true } = {}) {
    const shouldAnimate = animate && mode !== authMode;
    authMode = mode;
    const isSignup = mode === 'signup';
    const signupFields = document.getElementById('signupFields');
    if (shouldAnimate) {
        animateSignupFields(signupFields, isSignup);
    } else {
        signupFields.revealAnimations?.forEach(animation => animation.cancel());
        signupFields.revealAnimations = null;
        signupFields.classList.toggle('hidden', !isSignup);
    }
    document.querySelector('.auth-tabs-group')?.classList.toggle('is-signup', isSignup);
    signupFields.querySelectorAll('input').forEach(input => {
        input.disabled = !isSignup;
        input.required = isSignup;
    });
    document.getElementById('username').disabled = !isSignup;
    document.getElementById('username').required = isSignup;
    document.getElementById('tab-login-btn').classList.toggle('active', !isSignup);
    document.getElementById('tab-login-btn').setAttribute('aria-selected', String(!isSignup));
    document.getElementById('tab-register-btn').classList.toggle('active', isSignup);
    document.getElementById('tab-register-btn').setAttribute('aria-selected', String(isSignup));
    document.getElementById('authHeading').textContent = isSignup ? 'Create an account' : 'Sign in';
    document.getElementById('authDescription').textContent = isSignup
        ? 'Your account details will be saved in this browser. No password or email verification is used.'
        : 'Enter the email address associated with your account in this browser.';
    document.getElementById('authSubmitButton').textContent = isSignup ? 'Create account' : 'Sign in';
    setAuthMessage('');
    if (shouldAnimate && !authMotionQuery.matches) {
        ['authHeading', 'authDescription', 'authSubmitButton'].forEach((id, index) => {
            document.getElementById(id).animate(
                [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
                { duration: 340, delay: index * 50, easing: AUTH_EASE, fill: 'backwards' }
            );
        });
    }
}

document.getElementById('tab-login-btn').addEventListener('click', () => setAuthMode('signin'));
document.getElementById('tab-register-btn').addEventListener('click', () => setAuthMode('signup'));

document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = document.getElementById('authSubmitButton');
    submitButton.disabled = true;
    submitButton.classList.add('is-loading');
    // A short beat with the spinner so the press registers before anything changes
    if (!authMotionQuery.matches) await new Promise(resolve => setTimeout(resolve, 380));
    try {
        const email = normalizeEmail(document.getElementById('email').value);
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Enter a valid email address.');
        }
        const accounts = readLocalAccounts();
        if (authMode === 'signup') {
            if (accounts[email]) throw new Error('A local account already uses this email. Switch to Sign in instead.');
            const profile = {
                username: document.getElementById('username').value.trim(),
                age: Number(document.getElementById('signupAge').value),
                country: document.getElementById('signupCountry').value.trim(),
                province: document.getElementById('signupProvince').value.trim(),
                city: document.getElementById('signupCity').value.trim(),
                barangay: document.getElementById('signupBarangay').value.trim(),
                avatarDataUrl: null
            };
            if (!profile.username) throw new Error('Enter a display name.');
            if (!Number.isInteger(profile.age) || profile.age < 13 || profile.age > 120) {
                throw new Error('Age must be between 13 and 120.');
            }
            accounts[email] = {
                email,
                profile,
                transactions: [],
                cart: [],
                deliveryModes: {},
                currency: 'PHP',
                createdAt: new Date().toISOString()
            };
            writeLocalAccounts(accounts);
        } else if (!accounts[email]) {
            throw new Error('No local account was found for this email. Choose Create account to register in this browser.');
        }
        localStorage.setItem(LOCAL_SESSION_KEY, email);
        const exitAnimation = await playAuthExit();
        try {
            enterLocalAccount(email);
        } finally {
            // The card is hidden now; reset it so it shows normally after signing out
            exitAnimation?.cancel();
        }
        setAuthMessage('');
    } catch (error) {
        console.error('Unable to open local account:', error);
        setAuthMessage(error.message || 'Unable to open this local account.', true);
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('is-loading');
    }
});

function setProfileAvatar(avatarUrl, name) {
    const image = document.getElementById('profileAvatarImage');
    const initials = document.getElementById('avatar-char');
    const fallback = (name || 'U').trim().charAt(0).toUpperCase() || 'U';
    initials.textContent = fallback;
    document.getElementById('profilePreviewInitial').textContent = fallback;

    if (avatarUrl) {
        image.src = avatarUrl;
        image.classList.remove('hidden');
        initials.classList.add('hidden');
        const preview = document.getElementById('profilePreview');
        preview.src = avatarUrl;
        preview.classList.remove('hidden');
        document.getElementById('profilePreviewInitial').classList.add('hidden');
    } else {
        image.removeAttribute('src');
        image.classList.add('hidden');
        initials.classList.remove('hidden');
        document.getElementById('profilePreview').removeAttribute('src');
        document.getElementById('profilePreview').classList.add('hidden');
        document.getElementById('profilePreviewInitial').classList.remove('hidden');
    }
}

function fillProfileForm(profile, email) {
    currentUserData = {
        id: email,
        name: profile.username || '',
        email,
        age: profile.age ?? '',
        country: profile.country || '',
        province: profile.province || '',
        city: profile.city || '',
        barangay: profile.barangay || '',
        avatarDataUrl: profile.avatarDataUrl || null
    };
    document.getElementById('display-name').textContent = currentUserData.name || 'Profile';
    document.getElementById('profileMenuUserName').textContent = currentUserData.name || 'Your account';
    document.getElementById('profileMenuUserEmail').textContent = currentUserData.email;
    document.getElementById('profileName').value = currentUserData.name;
    document.getElementById('profileEmail').value = currentUserData.email;
    document.getElementById('profileAge').value = currentUserData.age;
    document.getElementById('profileCountry').value = currentUserData.country;
    document.getElementById('profileProvince').value = currentUserData.province;
    document.getElementById('profileCity').value = currentUserData.city;
    document.getElementById('profileBarangay').value = currentUserData.barangay;
    document.getElementById('newAccountEmail').value = email;
    setProfileAvatar(currentUserData.avatarDataUrl, currentUserData.name);
}

function enterLocalAccount(email) {
    const normalizedEmail = normalizeEmail(email);
    const account = readLocalAccounts()[normalizedEmail];
    if (!account || !account.profile) throw new Error('The saved local account is incomplete or no longer exists.');
    activeLocalAccountEmail = normalizedEmail;
    selectedCurrency = Object.hasOwn(currencyRates, account.currency) ? account.currency : 'PHP';
    shoppingCart = normalizeCart(account.cart);
    selectedDeliveryModes.clear();
    Object.entries(account.deliveryModes || {}).forEach(([key, value]) => {
        if (value === 'physical' || value === 'digital') selectedDeliveryModes.set(key, value);
    });
    wishlistKeys = new Set(Array.isArray(account.wishlist) ? account.wishlist : []);
    closeWishlistView();
    updateWishlistControls();
    lastCompletedOrder = null;
    fillProfileForm(account.profile, normalizedEmail);
    document.getElementById('currencySelect').value = selectedCurrency;
    updateCurrencyDisplays();
    updateCartBadgeCount();
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('shop-screen').classList.remove('hidden');
    document.getElementById('settingsToggle').classList.remove('hidden');
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('accountDialog').classList.add('hidden');
    switchPlatformEcosystem('switch');
    displayGames(currentCatalog);
}

document.getElementById('profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    const saveButton = event.currentTarget.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    const message = document.getElementById('profileMessage');
    message.textContent = 'Saving to this browser…';
    message.classList.remove('error');

    try {
        const accounts = readLocalAccounts();
        const account = accounts[activeLocalAccountEmail];
        if (!account) throw new Error('The active local account could not be found.');
        const updatedProfile = {
            ...account.profile,
            username: document.getElementById('profileName').value.trim(),
            age: Number(document.getElementById('profileAge').value),
            country: document.getElementById('profileCountry').value.trim(),
            province: document.getElementById('profileProvince').value.trim(),
            city: document.getElementById('profileCity').value.trim(),
            barangay: document.getElementById('profileBarangay').value.trim()
        };
        if (!updatedProfile.username) throw new Error('Display name cannot be empty.');
        if (!Number.isInteger(updatedProfile.age) || updatedProfile.age < 13 || updatedProfile.age > 120) {
            throw new Error('Age must be between 13 and 120.');
        }
        if (stagedProfilePhoto) {
            updatedProfile.avatarDataUrl = await compressAvatar(stagedProfilePhoto);
        }
        account.profile = updatedProfile;
        writeLocalAccounts(accounts);
        currentUserData = { ...currentUserData, ...updatedProfile };
        document.getElementById('display-name').textContent = updatedProfile.username;
        document.getElementById('profileMenuUserName').textContent = updatedProfile.username;
        stagedProfilePhoto = null;
        setProfileAvatar(updatedProfile.avatarDataUrl, updatedProfile.username);
        message.textContent = 'Profile saved in this browser.';
    } catch (error) {
        message.textContent = error.message || 'Unable to save your profile.';
        message.classList.add('error');
    } finally {
        saveButton.disabled = false;
    }
});

async function compressAvatar(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not prepare this photo.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.78));
        if (!blob) throw new Error('Your browser could not compress this photo.');
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Unable to read the compressed photo.'));
            reader.readAsDataURL(blob);
        });
    } finally {
        bitmap?.close();
    }
}

document.getElementById('profilePhotoInput').addEventListener('change', event => {
    const [file] = event.target.files;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
        event.target.value = '';
        document.getElementById('profileMessage').textContent = 'Choose a JPG, PNG, or WebP photo smaller than 3 MB.';
        document.getElementById('profileMessage').classList.add('error');
        return;
    }
    stagedProfilePhoto = file;
    setProfileAvatar(URL.createObjectURL(file), document.getElementById('profileName').value);
});

document.getElementById('emailChangeForm').addEventListener('submit', event => {
    event.preventDefault();
    const message = document.getElementById('settingsMessage');
    message.textContent = '';
    message.classList.remove('error');
    try {
        const newEmail = normalizeEmail(document.getElementById('newAccountEmail').value);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error('Enter a valid email address.');
        const accounts = readLocalAccounts();
        if (newEmail !== activeLocalAccountEmail && accounts[newEmail]) {
            throw new Error('A local account already uses that email.');
        }
        const account = accounts[activeLocalAccountEmail];
        if (!account) throw new Error('The active local account could not be found.');
        const previousEmail = activeLocalAccountEmail;
        if (newEmail !== previousEmail) {
            delete accounts[previousEmail];
            account.email = newEmail;
            accounts[newEmail] = account;
            localStorage.setItem(LOCAL_SESSION_KEY, newEmail);
            try {
                writeLocalAccounts(accounts);
            } catch (error) {
                try {
                    localStorage.setItem(LOCAL_SESSION_KEY, previousEmail);
                } catch (rollbackError) {
                    console.error('Unable to restore the previous local session after email change failed:', rollbackError);
                }
                throw error;
            }
        } else {
            writeLocalAccounts(accounts);
        }
        activeLocalAccountEmail = newEmail;
        fillProfileForm(account.profile, newEmail);
        message.textContent = 'Account email updated in this browser. No verification email was sent.';
    } catch (error) {
        message.textContent = error.message || 'Unable to request an email change.';
        message.classList.add('error');
    }
});

async function loadTransactionHistory() {
    const list = document.getElementById('transactionHistoryList');
    let account;
    try {
        account = getActiveLocalAccount();
    } catch (error) {
        list.textContent = `Unable to load transaction history: ${error.message}`;
        return;
    }
    if (!account) {
        list.textContent = 'Sign in to view this local account’s transaction history.';
        return;
    }
    const transactions = Array.isArray(account.transactions) ? [...account.transactions].reverse() : [];
    if (!transactions.length) {
        list.innerHTML = '<p class="account-help-text">No transactions yet.</p>';
        return;
    }
    list.innerHTML = transactions.map(transaction => `
        <article class="transaction-history-card">
            <div class="transaction-history-header">
                <strong>${escapeHtml(transaction.transaction_number)}</strong>
                <span>${escapeHtml(new Date(transaction.created_at).toLocaleDateString())}</span>
            </div>
            <ul class="transaction-history-items">
                ${transaction.items.map(item => `
                    <li>
                        <span>${escapeHtml(item.title)}${(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ''} · ${escapeHtml(platformBranding[item.platform]?.name || item.platform)} · ${escapeHtml(item.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code')}${Array.isArray(item.promoCodes) && item.promoCodes.length ? `<small class="transaction-promo-codes">Promo code${item.promoCodes.length > 1 ? 's' : ''}: ${escapeHtml(item.promoCodes.join(', '))}</small>` : ''}</span>
                        <strong>${escapeHtml(formatCurrency(Number(item.price) * (item.quantity || 1)))}</strong>
                    </li>
                `).join('')}
            </ul>
            <div class="transaction-history-footer">
                <span>${transaction.payment_method ? `${escapeHtml(String(transaction.payment_method).toUpperCase())} · ` : ''}Order placed</span>
                <strong>${escapeHtml(formatCurrency(Number(transaction.total)))}</strong>
            </div>
            <small>Shipping address: ${escapeHtml([
                transaction.shipping_address?.barangay,
                transaction.shipping_address?.city,
                transaction.shipping_address?.province,
                transaction.shipping_address?.country
            ].filter(Boolean).join(', ') || 'Not provided')}</small>
            <small>${escapeHtml(transaction.delivery_estimate)}</small>
        </article>
    `).join('');
}

function openAccountView(view) {
    const views = ['profile', 'settings', 'transactions'];
    if (!views.includes(view)) throw new Error(`Unsupported account view: ${view}`);
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('profileMenuToggle').setAttribute('aria-expanded', 'false');
    cancelDialogClose(document.getElementById('accountDialog'));
    document.getElementById('accountDialog').classList.remove('hidden');
    document.getElementById('accountDialogTitle').textContent = view === 'transactions'
        ? 'Transaction history'
        : view === 'settings' ? 'Account settings' : 'Profile';
    views.forEach(name => {
        document.getElementById(`accountView${name[0].toUpperCase()}${name.slice(1)}`).classList.toggle('hidden', name !== view);
    });
    document.querySelectorAll('.account-tabs [data-account-view]').forEach(button => {
        button.classList.toggle('active', button.dataset.accountView === view);
    });
    if (view === 'transactions') loadTransactionHistory();
    const target = view === 'profile'
        ? document.getElementById('profileName')
        : view === 'settings' ? document.getElementById('newAccountEmail') : document.getElementById('closeAccountDialog');
    target.focus();
}

document.querySelectorAll('[data-account-view]').forEach(button => {
    button.addEventListener('click', () => openAccountView(button.dataset.accountView));
});
document.getElementById('profileMenuToggle').addEventListener('click', () => {
    const menu = document.getElementById('profileMenu');
    const isOpening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !isOpening);
    document.getElementById('profileMenuToggle').setAttribute('aria-expanded', String(isOpening));
});
document.getElementById('signOutButton').addEventListener('click', () => {
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Sign out warning', `Your account data may not have been saved: ${error.message}`);
    }
    try {
        localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch (error) {
        triggerLiveToastNotification('Sign out warning', `The browser could not clear the saved session: ${error.message}`);
    }
    activeLocalAccountEmail = null;
    currentUserData = { id: null, name: '', email: '', age: null, country: '', province: '', city: '', barangay: '', avatarDataUrl: null };
    shoppingCart = [];
    selectedDeliveryModes.clear();
    lastCompletedOrder = null;
    updateCartBadgeCount();
    document.getElementById('transactionHistoryList').replaceChildren();
    document.getElementById('accountDialog').classList.add('hidden');
    document.getElementById('settingsToggle').classList.add('hidden');
    document.getElementById('shop-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.body.classList.remove('dashboard-home', 'platform-switch', 'platform-psp', 'platform-xbox');
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('profileMenuToggle').setAttribute('aria-expanded', 'false');
    setAuthMode('signin', { animate: false });
});
function closeAccountDialog() {
    closeDialogAnimated(document.getElementById('accountDialog'));
    document.getElementById('profileMenuToggle').focus();
}

document.getElementById('closeAccountDialog').addEventListener('click', closeAccountDialog);
document.getElementById('accountDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeAccountDialog();
});
document.querySelector('[data-open-currency-settings]').addEventListener('click', () => {
    closeDialogAnimated(document.getElementById('accountDialog'));
    document.getElementById('settingsPanel').classList.remove('hidden');
    document.getElementById('settingsToggle').setAttribute('aria-expanded', 'true');
});
document.getElementById('profileMenu').addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', event => {
    const menu = document.getElementById('profileMenu');
    if (!menu.classList.contains('hidden') &&
        !menu.contains(event.target) &&
        !document.getElementById('profileMenuToggle').contains(event.target)) {
        menu.classList.add('hidden');
        document.getElementById('profileMenuToggle').setAttribute('aria-expanded', 'false');
    }
});

function initializeLocalAccounts() {
    setAuthMode('signin', { animate: false });
    try {
        const savedEmail = localStorage.getItem(LOCAL_SESSION_KEY);
        if (!savedEmail) return;
        enterLocalAccount(savedEmail);
    } catch (error) {
        console.error('Unable to restore local account session:', error);
        try {
            localStorage.removeItem(LOCAL_SESSION_KEY);
        } catch (storageError) {
            console.error('Unable to clear the invalid local session:', storageError);
        }
        setAuthMessage(`Could not restore the saved local account: ${error.message}`, true);
    }
}

document.getElementById('accountDialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), label[for="profilePhotoInput"]')]
        .filter(element => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

// ===== CART WITH QUANTITIES =====
const quantityDialog = document.getElementById('quantityDialog');
const quantityInput = document.getElementById('quantityInput');
let pendingCartGame = null;
let quantityReturnFocus = null;

function clampQuantity(value) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(MAX_CART_QUANTITY, Math.max(1, parsed));
}

function getCartLineKey(item) {
    return `${item.platform || 'switch'}:${item.id}:${item.deliveryMode || 'digital'}`;
}

// Merges duplicate lines and gives older saved carts (no quantity) a quantity of 1.
function normalizeCart(rawCart) {
    const merged = new Map();
    (Array.isArray(rawCart) ? rawCart : []).forEach(item => {
        if (!item || typeof item !== 'object') return;
        const quantity = clampQuantity(item.quantity);
        const key = getCartLineKey(item);
        const existing = merged.get(key);
        if (existing) {
            existing.quantity = clampQuantity(existing.quantity + quantity);
        } else {
            merged.set(key, { ...item, quantity });
        }
    });
    return [...merged.values()];
}

function getCartItemCount() {
    return shoppingCart.reduce((sum, item) => sum + (item.quantity || 1), 0);
}

function findGameForCart(gameId) {
    const normalizedId = String(gameId);
    return currentCatalog.find(g => String(g.id) === normalizedId)
        || getAllPlatformGames().find(g => String(g.id) === normalizedId || Number(g.id) === Number(gameId));
}

function getGameDeliveryMode(game) {
    const platform = game.platform || currentPlatform;
    return selectedDeliveryModes.get(`${platform}:${String(game.id)}`) || 'digital';
}

function updateQuantitySubtotal() {
    if (!pendingCartGame) return;
    document.getElementById('quantitySubtotal').textContent =
        formatCurrency(pendingCartGame.price * clampQuantity(quantityInput.value));
}

function setQuantity(value) {
    quantityInput.value = String(clampQuantity(value));
    updateQuantitySubtotal();
}

// "Add to Cart" buttons call this: it asks how many copies before adding.
function addItemToCart(gameId) {
    const game = findGameForCart(gameId);
    if (!game) {
        console.error(`Unable to find game ${gameId} to add to the cart.`);
        return;
    }
    pendingCartGame = game;
    quantityReturnFocus = document.activeElement;
    setPlatformThemeClass(quantityDialog, game.platform || currentPlatform);
    const platformName = platformBranding[game.platform || currentPlatform]?.name || '';
    const formatName = getGameDeliveryMode(game) === 'physical' ? 'Disc/Card' : 'Promo Code';
    document.getElementById('quantityDialogTitle').textContent = game.title;
    document.getElementById('quantityDialogMeta').textContent =
        `${platformName} · ${formatName} · ${formatCurrency(game.price)} each`;
    setQuantity(1);
    cancelDialogClose(quantityDialog);
    quantityDialog.classList.remove('hidden');
    quantityInput.focus();
    quantityInput.select();
}

function closeQuantityDialog() {
    closeDialogAnimated(quantityDialog);
    pendingCartGame = null;
    if (quantityReturnFocus?.isConnected) quantityReturnFocus.focus();
    quantityReturnFocus = null;
}

function confirmAddToCart() {
    if (!pendingCartGame) return;
    const game = pendingCartGame;
    const quantity = clampQuantity(quantityInput.value);
    closeQuantityDialog();
    addGameToCart(game, quantity);
}

function addGameToCart(game, quantity) {
    const platform = game.platform || currentPlatform;
    const newLine = { ...game, platform, deliveryMode: getGameDeliveryMode(game), quantity };
    const key = getCartLineKey(newLine);
    const existing = shoppingCart.find(item => getCartLineKey(item) === key);
    if (existing) {
        existing.quantity = clampQuantity((existing.quantity || 1) + quantity);
    } else {
        shoppingCart.push(newLine);
    }
    updateCartBadgeCount();
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Cart not saved', error.message);
    }
    const itemCount = getCartItemCount();
    triggerLiveToastNotification(
        'Added to cart',
        `${quantity} × ${game.title}. Your cart now has ${itemCount} item${itemCount === 1 ? '' : 's'}.`
    );
    const badge = document.getElementById('cartBtn');
    badge.style.transform = 'scale(1.15)';
    setTimeout(() => { badge.style.transform = 'scale(1)'; }, 150);
}

document.getElementById('quantityMinus').addEventListener('click', () => setQuantity(clampQuantity(quantityInput.value) - 1));
document.getElementById('quantityPlus').addEventListener('click', () => setQuantity(clampQuantity(quantityInput.value) + 1));
quantityInput.addEventListener('input', updateQuantitySubtotal);
quantityInput.addEventListener('blur', () => setQuantity(quantityInput.value));
quantityInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        confirmAddToCart();
    }
});
document.getElementById('confirmQuantityBtn').addEventListener('click', confirmAddToCart);
document.getElementById('cancelQuantityBtn').addEventListener('click', closeQuantityDialog);
document.getElementById('closeQuantityDialog').addEventListener('click', closeQuantityDialog);
quantityDialog.addEventListener('click', event => {
    if (event.target === quantityDialog) closeQuantityDialog();
});
quantityDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...quantityDialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

function removeItemFromCart(index) {
    shoppingCart.splice(index, 1);
    updateCartBadgeCount();
    renderCartListRows();
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Cart not saved', error.message);
    }
}

function changeCartQuantity(index, delta) {
    const item = shoppingCart[index];
    if (!item) return;
    const nextQuantity = clampQuantity((item.quantity || 1) + delta);
    if (nextQuantity === item.quantity) return;
    item.quantity = nextQuantity;
    updateCartBadgeCount();
    renderCartListRows();
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Cart not saved', error.message);
    }
}

function updateCartBadgeCount() {
    const totalItems = getCartItemCount();
    document.getElementById('cartCounter').innerText = totalItems;
    document.getElementById('floatingCartCount').innerText = totalItems;

    const floatingBtn = document.getElementById('floatingBuyBtn');
    if (totalItems > 0) {
        floatingBtn.classList.remove('hidden-btn');
    } else {
        floatingBtn.classList.add('hidden-btn');
    }
}

function calculateCartTotal() {
    return shoppingCart.reduce((totalPrice, game) => totalPrice + game.price * (game.quantity || 1), 0);
}

function renderCartListRows() {
    const listContainer = document.getElementById('cartItemsList');
    listContainer.innerHTML = '';

    if (shoppingCart.length === 0) {
        listContainer.innerHTML = `<p style="color:#8f8f8f; text-align:center; padding: 20px 0;">Your cart is completely empty.</p>`;
        document.getElementById('proceedToPayBtn').disabled = true;
    } else {
        document.getElementById('proceedToPayBtn').disabled = false;
        shoppingCart.forEach((item, index) => {
            const quantity = item.quantity || 1;
            const row = document.createElement('div');
            row.className = 'cart-row';
            row.innerHTML = `
                <div class="cart-row-info">
                    <span class="cart-row-title">${escapeHtml(item.title)}</span>
                    <span class="cart-row-delivery">${item.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code'} · ${formatCurrency(item.price)} each</span>
                    <div class="cart-row-controls">
                        <button type="button" class="qty-mini-btn" aria-label="Decrease quantity of ${escapeHtml(item.title)}" onclick="changeCartQuantity(${index}, -1)"${quantity <= 1 ? ' disabled' : ''}>−</button>
                        <span class="cart-row-qty" aria-label="Quantity">${quantity}</span>
                        <button type="button" class="qty-mini-btn" aria-label="Increase quantity of ${escapeHtml(item.title)}" onclick="changeCartQuantity(${index}, 1)"${quantity >= MAX_CART_QUANTITY ? ' disabled' : ''}>+</button>
                        <button type="button" class="remove-item-btn" onclick="removeItemFromCart(${index})">Remove</button>
                    </div>
                </div>
                <span class="cart-row-price">${formatCurrency(item.price * quantity)}</span>
            `;
            listContainer.appendChild(row);
        });
    }
    document.getElementById('cartTotalValue').innerText = formatCurrency(calculateCartTotal());
}

function renderPaymentFields(method) {
    const layer = document.getElementById('payment-form-fields');
    const fields = {
        mastercard: `
            <div class="form-group">
                <label for="paymentCardholder">Name on card</label>
                <input id="paymentCardholder" name="cardholder" type="text" autocomplete="off" maxlength="80" required>
            </div>
            <div class="form-group">
                <label for="paymentCardLastFour">Card number (last 4 digits only)</label>
                <input id="paymentCardLastFour" name="cardLastFour" type="text" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="1234" aria-describedby="paymentFieldNote" required>
            </div>`,
        gcash: `
            <div class="form-group">
                <label for="paymentGcashName">Account holder name</label>
                <input id="paymentGcashName" name="gcashName" type="text" autocomplete="off" maxlength="80" required>
            </div>
            <div class="form-group">
                <label for="paymentGcashPhone">GCash mobile number</label>
                <input id="paymentGcashPhone" name="gcashPhone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" pattern="[0-9+() -]{7,20}" placeholder="+63 9XX XXX XXXX" required>
            </div>`,
        paypal: `
            <div class="form-group">
                <label for="paymentPaypalEmail">PayPal account email</label>
                <input id="paymentPaypalEmail" name="paypalEmail" type="email" autocomplete="off" maxlength="254" placeholder="you@example.com" required>
            </div>`,
        '711': `
            <div class="form-group">
                <label for="payment711Name">Payer name</label>
                <input id="payment711Name" name="payerName" type="text" autocomplete="off" maxlength="80" required>
            </div>
            <div class="form-group">
                <label for="payment711Phone">Mobile number</label>
                <input id="payment711Phone" name="payerPhone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" pattern="[0-9+() -]{7,20}" placeholder="+63 9XX XXX XXXX" required>
            </div>`,
        bank: `
            <div class="form-group">
                <label for="paymentBankName">Account holder name</label>
                <input id="paymentBankName" name="bankAccountName" type="text" autocomplete="off" maxlength="80" required>
            </div>
            <div class="form-group">
                <label for="paymentBankReference">Transfer reference (optional)</label>
                <input id="paymentBankReference" name="bankReference" type="text" autocomplete="off" maxlength="40">
            </div>`
    }[method];
    if (!fields) throw new Error(`Unsupported payment method: ${method}`);
    layer.innerHTML = fields;
}

document.getElementById('cartBtn').addEventListener('click', openCheckoutSequence);
document.getElementById('floatingBuyBtn').addEventListener('click', () => {
    runLoadingSequence(openCheckoutSequence);
});

function openCheckoutSequence() {
    document.getElementById('cart-modal').classList.remove('hidden');
    document.getElementById('checkout-stage-items').classList.remove('hidden');
    document.getElementById('checkout-stage-payment').classList.add('hidden');
    document.getElementById('checkout-stage-success').classList.add('hidden');
    renderCartListRows();
}

document.getElementById('closeCartBtn').addEventListener('click', () => {
    document.getElementById('cart-modal').classList.add('hidden');
});

document.getElementById('proceedToPayBtn').addEventListener('click', () => {
    runLoadingSequence(() => {
        document.getElementById('checkout-stage-items').classList.add('hidden');
        document.getElementById('checkout-stage-payment').classList.remove('hidden');
        renderPaymentFields(document.querySelector('input[name="paymentMethod"]:checked').value);
    }, 1200);
});

document.getElementById('backToCartBtn').addEventListener('click', () => {
    document.getElementById('checkout-stage-payment').classList.add('hidden');

document.getElementById('checkout-stage-items').classList.remove('hidden');
});
document.getElementsByName('paymentMethod').forEach(radio => {
radio.addEventListener('change', (e) => renderPaymentFields(e.target.value));
});
// PROCESSING SCREEN HELPERS
function setLoadingStatus(text) {
    const status = document.getElementById('loadingStatusText');
    if (status) status.textContent = text;
}

// Fixed-length loading screen (used for short transitions)
function runLoadingSequence(onComplete, duration = 400) {
    const loadingScreen = document.getElementById('loadingOverlay');
    const loadingFill = document.getElementById('loadingBarFill');
    document.getElementById('loadingPlatformLogo').src = platformBranding[currentPlatform]?.logo || platformBranding.switch.logo;
    setLoadingStatus('Processing Transaction');

    loadingFill.style.width = '0%';
    loadingScreen.classList.remove('hidden');

    let currentProgress = 0;
    const progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + (4000 / duration), 100);
        loadingFill.style.width = `${currentProgress}%`;

        if (currentProgress >= 100) {
            clearInterval(progressInterval);
            loadingScreen.classList.add('hidden');
            onComplete();
        }
    }, 40);
}

// Loading screen that stays up until `task()` finishes (e.g. while the receipt email is being sent).
// The bar creeps toward 90% while waiting, then fills to 100% and closes once the task is done.
async function runLoadingWhile(task, minDuration = 1200) {
    const loadingScreen = document.getElementById('loadingOverlay');
    const loadingFill = document.getElementById('loadingBarFill');
    document.getElementById('loadingPlatformLogo').src = platformBranding[currentPlatform]?.logo || platformBranding.switch.logo;
    setLoadingStatus('Processing Transaction');

    loadingFill.style.width = '0%';
    loadingScreen.classList.remove('hidden');

    let progress = 0;
    const startedAt = Date.now();
    const progressTimer = setInterval(() => {
        progress += (90 - progress) * 0.04;
        loadingFill.style.width = `${progress}%`;
    }, 60);

    let result;
    let failure = null;
    try {
        result = await task();
    } catch (error) {
        failure = error;
    }

    const remaining = minDuration - (Date.now() - startedAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

    clearInterval(progressTimer);
    loadingFill.style.width = '100%';
    await new Promise(resolve => setTimeout(resolve, 300));
    loadingScreen.classList.add('hidden');
    setLoadingStatus('Processing Transaction');

    if (failure) throw failure;
    return result;
}

document.getElementById('finalPlaceOrderBtn').addEventListener('click', async () => {
    const paymentFields = document.getElementById('payment-form-fields');
    const invalidField = [...paymentFields.querySelectorAll('input')].find(input => !input.checkValidity());
    if (invalidField) {
        invalidField.reportValidity();
        return;
    }
    const selectedMode = document.querySelector('input[name="paymentMethod"]:checked').value;
    const button = document.getElementById('finalPlaceOrderBtn');
    button.disabled = true;
    document.getElementById('cart-modal').classList.add('hidden');

    try {
        // The loading screen stays up until the order is saved AND the email has finished sending (or failed).
        await runLoadingWhile(() => triggerReceiptGeneration(selectedMode));
        document.getElementById('cart-modal').classList.remove('hidden');
        document.getElementById('checkout-stage-items').classList.add('hidden');
        document.getElementById('checkout-stage-payment').classList.add('hidden');
        document.getElementById('checkout-stage-success').classList.remove('hidden');
    } catch (error) {
        console.error('Order failed:', error);
        document.getElementById('cart-modal').classList.remove('hidden');
        document.getElementById('checkout-stage-payment').classList.remove('hidden');
        const checkoutError = document.getElementById('checkoutError');
        checkoutError.textContent = error.message || 'Unable to save the order.';
        checkoutError.classList.remove('hidden');
    } finally {
        button.disabled = false;
    }
});

async function triggerReceiptGeneration(selectedMode) {
    if (!activeLocalAccountEmail) throw new Error('Sign in before placing an order.');
    if (shoppingCart.length === 0) {
        throw new Error('Your cart is empty.');
    }
    document.getElementById('checkoutError').classList.add('hidden');
    const accounts = readLocalAccounts();
    const account = accounts[activeLocalAccountEmail];
    if (!account) throw new Error('The active local account could not be found.');
    const createdAt = new Date().toISOString();
    const transactionToken = `LOCAL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const addressParts = [currentUserData.barangay, currentUserData.city, currentUserData.province, currentUserData.country]
        .filter(Boolean);
    const address = addressParts.join(', ') || 'Not provided';
    const orderItems = shoppingCart.map(game => {
        const quantity = game.quantity || 1;
        const deliveryMode = game.deliveryMode || 'digital';
        return {
            id: String(game.id),
            title: game.title,
            platform: game.platform || currentPlatform,
            price: Number(game.price),
            quantity,
            deliveryMode,
            // every digital copy gets its own promo code
            ...(deliveryMode === 'digital' ? { promoCodes: generatePromoCodes(quantity) } : {})
        };
    });
    const total = calculateCartTotal();
    const deliveryEstimate = buildDeliveryEstimate(orderItems, createdAt);

    // ---- Send receipt email via EmailJS (order still succeeds if this fails) ----
    let receiptEmailSent = false;
    let receiptEmailError = '';
    setLoadingStatus('Sending your receipt');
    try {
        await sendReceiptEmail({
            email: currentUserData.email,
            name: currentUserData.name,
            orderId: transactionToken,
            items: orderItems,
            total,
            paymentMethod: selectedMode,
            address,
            deliveryEstimate,
            createdAt
        });
        receiptEmailSent = true;
    } catch (error) {
        console.error('EmailJS send failed:', error);
        receiptEmailError = `Receipt email could not be sent: ${error?.text || error?.message || 'unknown error'}`;
    }

    const transaction = {
        id: transactionToken,
        transaction_number: transactionToken,
        status: 'order_placed',
        currency: selectedCurrency,
        total,
        items: orderItems,
        shipping_address: {
            barangay: currentUserData.barangay,
            city: currentUserData.city,
            province: currentUserData.province,
            country: currentUserData.country
        },
        delivery_estimate: deliveryEstimate,
        created_at: createdAt,
        receipt_email_sent: receiptEmailSent,
        payment_method: selectedMode
    };
    account.transactions = Array.isArray(account.transactions) ? account.transactions : [];
    account.transactions.push(transaction);
    account.cart = [];
    account.currency = selectedCurrency;
    account.deliveryModes = Object.fromEntries(selectedDeliveryModes);
    writeLocalAccounts(accounts);
    lastCompletedOrder = {
        transactionToken,
        status: transaction.status,
        receiptEmailSent,
        receiptEmailError,
        deliveryEstimate,
        paymentMethod: selectedMode,
        address,
        email: currentUserData.email,
        items: orderItems,
        total
    };
    document.getElementById('receipt-user').textContent = currentUserData.name;

    renderReceipt();
    shoppingCart = [];
    updateCartBadgeCount();
    triggerLiveToastNotification(
        'Order placed',
        receiptEmailSent
            ? `A receipt was emailed to ${currentUserData.email}.`
            : 'Your order was placed, but the receipt email could not be sent.'
    );
}

function addBusinessDays(date, businessDays) {
    const result = new Date(date);
    let remaining = businessDays;
    while (remaining > 0) {
        result.setDate(result.getDate() + 1);
        if (result.getDay() !== 0 && result.getDay() !== 6) remaining--;
    }
    return result;
}

function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

function renderReceipt() {
    if (!lastCompletedOrder) return;

    const { transactionToken, deliveryEstimate, receiptEmailSent, receiptEmailError, paymentMethod, address, email, items, total } = lastCompletedOrder;
    const unitCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    let htmlContent = `
        <div class="receipt-header-title">Order confirmation</div>
        <div class="receipt-meta-row"><span>Reference</span><span class="receipt-meta-value">${escapeHtml(transactionToken)}</span></div>
        <div class="receipt-meta-row"><span>Payment</span><span class="receipt-meta-value">${escapeHtml(paymentMethod.toUpperCase())}</span></div>
        <div class="receipt-meta-row"><span>Ship to</span><span class="receipt-meta-value">${escapeHtml(address)}</span></div>
        <div class="receipt-meta-row"><span>Receipt email</span><span class="receipt-meta-value">${receiptEmailSent ? `Sent to ${escapeHtml(email)}` : 'Not sent'}</span></div>
        ${receiptEmailError ? `<p class="game-details-notes">${escapeHtml(receiptEmailError)}</p>` : ''}
        <div class="receipt-divider"></div>
    `;

    // One line per game, with the quantity shown once (e.g. "×4")
    items.forEach(game => {
        const quantity = game.quantity || 1;
        const isDigital = game.deliveryMode !== 'physical';
        const formatName = isDigital ? 'Promo Code' : 'Disc/Card';
        const details = [formatName];
        if (quantity > 1) details.push(`${formatCurrency(game.price)} each`);
        if (isDigital && receiptEmailSent) details.push('sent to your email');
        // If the email failed, show the codes here so the customer still gets them
        const codesNote = isDigital && !receiptEmailSent && Array.isArray(game.promoCodes) && game.promoCodes.length
            ? `<small class="receipt-promo-codes">${game.promoCodes.map(escapeHtml).join('<br>')}</small>`
            : '';
        htmlContent += `
            <div class="receipt-item-line">
                <span>
                    <span class="receipt-item-name">${escapeHtml(game.title)}</span>${quantity > 1 ? `<span class="receipt-item-qty">×${quantity}</span>` : ''}
                    <small class="receipt-item-delivery">${details.join(' · ')}</small>
                    ${codesNote}
                </span>
                <span class="receipt-item-price">${formatCurrency(game.price * quantity)}</span>
            </div>
        `;
    });

    htmlContent += `
        <div class="receipt-divider"></div>
        <div class="receipt-total-line">
            <span>Total (${unitCount} item${unitCount === 1 ? '' : 's'})</span>
            <span>${formatCurrency(total)}</span>
        </div>
        <p class="checkout-demo-notice">${escapeHtml(deliveryEstimate)}</p>
    `;

    if (paymentMethod === '711') {
        htmlContent += `
            <div class="receipt-barcode-banner">
                |||| | |||| ||| || |<br>
                7-Eleven payment reference: ${escapeHtml(transactionToken)}
            </div>
        `;
    }

    document.getElementById('receiptDetails').innerHTML = htmlContent;
}

document.getElementById('closeSuccessBtn').addEventListener('click', () => {
document.getElementById('cart-modal').classList.add('hidden');
});
document.querySelectorAll('.genre-btn').forEach(button => {
button.addEventListener('click', function() {
const targetedGenre = this.getAttribute('data-genre');
if (!targetedGenre) return;

activeGenre = targetedGenre;
resetGameSearch();
closeWishlistView();
playPageEnter('catalog');
document.querySelectorAll('.genre-btn[data-genre]').forEach(btn => btn.classList.remove('active'));
this.classList.add('active');
if (targetedGenre === 'membership') {
displayMemberships();
} else if (targetedGenre === 'All') {
displayGames(currentCatalog);
} else {
const filteredArray = currentCatalog.filter(game => game.genre === targetedGenre);
displayGames(filteredArray);
}
});
});

const imageLightbox = document.getElementById('imageLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const gameDetailsDialog = document.getElementById('gameDetailsDialog');
const gameDetailsContent = document.getElementById('gameDetailsContent');
let lastFocusedGameImage = null;
let lastFocusedGameCard = null;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function renderGamePurchaseControls(game, platform) {
    const gameId = String(game.id);
    const deliveryMode = selectedDeliveryModes.get(`${platform}:${gameId}`) || 'digital';
    return `
        <section class="game-details-purchase" aria-label="Purchase options">
            <span class="game-details-price" data-usd-price="${game.price}" data-game-id="${escapeHtml(gameId)}">${formatCurrency(game.price)}</span>
            <div class="delivery-options-group" role="group" aria-label="Choose delivery format">
                <button type="button" class="delivery-chip${deliveryMode === 'physical' ? ' active' : ''}" data-game-id="${escapeHtml(gameId)}" data-platform="${escapeHtml(platform)}" data-delivery-mode="physical" aria-pressed="${deliveryMode === 'physical'}">📦 Disc/Card</button>
                <button type="button" class="delivery-chip${deliveryMode === 'digital' ? ' active' : ''}" data-game-id="${escapeHtml(gameId)}" data-platform="${escapeHtml(platform)}" data-delivery-mode="digital" aria-pressed="${deliveryMode === 'digital'}">🔑 Promo Code</button>
            </div>
            <div class="game-details-actions">
                <button type="button" class="btn-buy game-details-buy" data-game-id="${escapeHtml(gameId)}">Add to Cart</button>
                ${renderWishlistDetailsButton({ ...game, platform })}
            </div>
        </section>
    `;
}

function openImageLightbox(gameImage) {
    lastFocusedGameImage = gameImage;
    lightboxImage.src = gameImage.src;
    lightboxImage.alt = gameImage.alt;
    imageLightbox.classList.remove('hidden');
    document.getElementById('closeImageLightbox').focus();
}

function closeImageLightbox() {
    imageLightbox.classList.add('hidden');
    lightboxImage.removeAttribute('src');
    if (lastFocusedGameImage?.isConnected) {
        lastFocusedGameImage.focus();
    }
}

function openGameDetails(gameCard) {
    const game = currentCatalog.find(item => String(item.id) === gameCard.dataset.gameId)
        || getAllPlatformGames().find(item =>
            String(item.id) === gameCard.dataset.gameId
            && (!gameCard.dataset.platform || item.platform === gameCard.dataset.platform)
        );
    if (!game) {
        console.error(`Unable to find game details for catalog entry ${gameCard.dataset.gameId}.`);
        return;
    }

    lastFocusedGameCard = gameCard;
    const gamePlatform = game.platform || currentPlatform;
    cancelDialogClose(gameDetailsDialog);
    setPlatformThemeClass(gameDetailsDialog, gamePlatform);
    const details = game.details;
    if (!details) {
        console.error(`Verified details are missing for ${game.title} (${gamePlatform}).`);
        gameDetailsContent.innerHTML = `
            <h2 id="gameDetailsTitle" class="game-details-heading">${escapeHtml(game.title)}</h2>
            <p class="game-details-synopsis">Verified game information is not available yet.</p>
            ${renderGamePurchaseControls(game, gamePlatform)}
        `;
        gameDetailsDialog.classList.remove('hidden');
        document.getElementById('closeGameDetails').focus();
        return;
    }
    const facts = [
        ['Platform', details.platforms],
        ['Age rating', details.rating],
        ['Storage', details.storage],
        ['Players', details.players],
        ['Game modes', details.modes]
    ].filter(([, value]) => typeof value === 'string' && value.trim());
    const additionalNotes = details.notes
        ? `<p class="game-details-notes">${escapeHtml(details.notes)}</p>`
        : '';
    const sourceLink = details.source
        ? `<a class="game-details-source" href="${escapeHtml(details.source)}" target="_blank" rel="noopener noreferrer">Official game details</a>`
        : '';

    gameDetailsContent.innerHTML = `
        <div class="game-details-layout">
            <img class="game-details-cover" src="${escapeHtml(getGameImagePath(game.artworkPlatform || gamePlatform, game.image))}" alt="${escapeHtml(game.title)} cover art" tabindex="0" title="Open cover art">
            <div>
                <p class="game-details-eyebrow">${escapeHtml(game.genre)} · ${escapeHtml({
                    switch: 'Nintendo Switch',
                    psp: 'PlayStation',
                    xbox: 'Xbox'
                }[gamePlatform] || gamePlatform.toUpperCase())}</p>
                <h2 id="gameDetailsTitle" class="game-details-heading">${escapeHtml(game.title)}</h2>
                <p class="game-details-synopsis">${escapeHtml(details.synopsis)}</p>
                <dl class="game-facts-grid">
                    ${facts.map(([label, value]) => `
                        <div class="game-fact">
                            <dt>${escapeHtml(label)}</dt>
                            <dd>${escapeHtml(value)}</dd>
                        </div>
                    `).join('')}
                </dl>
                ${additionalNotes}
                ${sourceLink}
                ${renderGamePurchaseControls(game, gamePlatform)}
            </div>
        </div>
    `;
    gameDetailsDialog.classList.remove('hidden');
    document.getElementById('closeGameDetails').focus();
}

gameDetailsContent.addEventListener('click', event => {
    const deliveryButton = event.target.closest('.delivery-chip');
    if (deliveryButton) {
        setGameDeliveryMode(
            deliveryButton.dataset.gameId,
            deliveryButton.dataset.deliveryMode,
            deliveryButton.dataset.platform
        );
        return;
    }

    const buyButton = event.target.closest('.game-details-buy');
    if (buyButton) {
        addItemToCart(buyButton.dataset.gameId);
    }
});

function closeGameDetails() {
    closeDialogAnimated(gameDetailsDialog);
    if (lastFocusedGameCard?.isConnected) {
        lastFocusedGameCard.focus();
    }
}

document.getElementById('gamesContainer').addEventListener('click', event => {
    if (event.target.closest('.btn-buy, .delivery-chip, .wishlist-heart')) return;
    const gameCard = event.target.closest('.game-card');
    if (gameCard) openGameDetails(gameCard);
});

document.getElementById('gamesContainer').addEventListener('keydown', event => {
    if (event.target.closest('.btn-buy, .delivery-chip, .wishlist-heart')) return;
    if (event.target.matches('.game-card') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openGameDetails(event.target);
    }
});

document.getElementById('closeImageLightbox').addEventListener('click', closeImageLightbox);
document.getElementById('closeGameDetails').addEventListener('click', closeGameDetails);
imageLightbox.addEventListener('click', event => {
    if (event.target === imageLightbox) {
        closeImageLightbox();
    }
});
imageLightbox.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
        event.preventDefault();
        document.getElementById('closeImageLightbox').focus();
    }
});
gameDetailsDialog.addEventListener('click', event => {
    if (event.target === gameDetailsDialog) {
        closeGameDetails();
    } else if (event.target.matches('.game-details-cover')) {
        openImageLightbox(event.target);
    }
});
gameDetailsDialog.addEventListener('keydown', event => {
    if (event.target.matches('.game-details-cover') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openImageLightbox(event.target);
        return;
    }

    if (event.key !== 'Tab' || !imageLightbox.classList.contains('hidden')) return;
    const focusableElements = [...gameDetailsDialog.querySelectorAll('button, a[href], [tabindex="0"]')];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }
});

const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');

function closeSettingsPanel() {
    settingsPanel.classList.add('hidden');
    settingsToggle.setAttribute('aria-expanded', 'false');
}

settingsToggle.addEventListener('click', () => {
    const isOpening = settingsPanel.classList.contains('hidden');
    settingsPanel.classList.toggle('hidden', !isOpening);
    settingsToggle.setAttribute('aria-expanded', String(isOpening));
});

document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsPanel);
document.getElementById('currencySelect').addEventListener('change', event => {
    if (!Object.hasOwn(currencyRates, event.target.value)) return;
    const previousCurrency = selectedCurrency;
    selectedCurrency = event.target.value;
    updateCurrencyDisplays();
    try {
        persistActiveLocalAccount();
    } catch (error) {
        selectedCurrency = previousCurrency;
        event.target.value = previousCurrency;
        updateCurrencyDisplays();
        triggerLiveToastNotification('Currency not saved', error.message);
    }
});

document.addEventListener('click', event => {
    if (!settingsPanel.classList.contains('hidden') &&
        !settingsPanel.contains(event.target) &&
        !settingsToggle.contains(event.target)) {
        closeSettingsPanel();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (newsDialog && !newsDialog.classList.contains('hidden')) {
            closeNewsDetails();
            return;
        }
        if (!quantityDialog.classList.contains('hidden')) {
            closeQuantityDialog();
            return;
        }
        if (!imageLightbox.classList.contains('hidden')) {
            closeImageLightbox();
        } else if (!gameDetailsDialog.classList.contains('hidden')) {
            closeGameDetails();
    } else if (!document.getElementById('accountDialog').classList.contains('hidden')) {
        closeAccountDialog();
    }
    closeSettingsPanel();
    }
});
const playstationGames = [
    { id: 'psp_17', title: "Marvel's Spider-Man 2", genre: 'Action-Adventure', price: 69.99, image: 'marvels_spiderman_2.jpg', color: '#a82127' },
    { id: 'psp_11', title: 'God of War Ragnarök', genre: 'Action-Adventure', price: 59.99, image: 'god_of_war_ragnarok.png', color: '#31506b' },
    { id: 'psp_4', title: 'Elden Ring: Tarnished Edition', genre: 'RPG', price: 59.99, image: 'elden_ring.jpg', color: '#947842', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH 2', details: 'Elden Ring: Tarnished Edition is available on Nintendo Switch 2, not the original Nintendo Switch.' }] },
    { id: 'psp_8', title: 'Ghost of Tsushima', genre: 'Action-Adventure', price: 59.99, image: 'ghost_of_tsushima.jpg', color: '#9a542f' },
    { id: 'psp_3', title: 'EA SPORTS FC 27', genre: 'Party-Racing', price: 69.99, image: 'ea_sports_fc.jpg', color: '#18723b', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH', details: 'EA SPORTS FC 27 is available for Nintendo Switch and Nintendo Switch 2.' }, { theme: 'xbox', label: 'XBOX', details: 'EA SPORTS FC 27 is available on Xbox One and Xbox Series X|S.' }] },
    { id: 'psp_2', title: 'Bloodborne', genre: 'Action-Adventure', price: 19.99, image: 'bloodborne.jpg', color: '#551b1b' },
    { id: 'psp_21', title: 'The Last of Us Part I', genre: 'Action-Adventure', price: 69.99, image: 'the_last_of_us_part_1.jpg', color: '#667341' },
    { id: 'psp_6', title: 'Final Fantasy VII Rebirth', genre: 'RPG', price: 69.99, image: 'final_fantasy_7_rebirth.jpg', color: '#40709b' },
    { id: 'psp_14', title: 'Horizon Forbidden West', genre: 'Action-Adventure', price: 59.99, image: 'horizon_forbidden_west.jpg', color: '#ac543a' },
    { id: 'psp_10', title: 'God of War', genre: 'Action-Adventure', price: 19.99, image: 'god_of_war.jpg', color: '#7e4e36' },
    { id: 'psp_16', title: "Marvel's Spider-Man", genre: 'Action-Adventure', price: 39.99, image: 'marvels_spiderman.jpg', color: '#a91b22' },
    { id: 'psp_18', title: 'Persona 5 Royal', genre: 'RPG', price: 59.99, image: 'persona_5_royal.jpg', color: '#b32029', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH', details: 'Persona 5 Royal is available on Nintendo Switch and PlayStation 4 and 5.' }] },
    { id: 'psp_12', title: 'Gran Turismo 7', genre: 'Party-Racing', price: 69.99, image: 'gran_turismo_7.jpg', color: '#355b83' },
    { id: 'psp_23', title: "Uncharted 4: A Thief's End", genre: 'Action-Adventure', price: 19.99, image: 'uncharted_4_a_thiefs_end.jpg', color: '#897046' },
    { id: 'psp_7', title: 'Final Fantasy VII Remake Intergrade', genre: 'RPG', price: 39.99, image: 'final_fantasy_7_remake.jpg', color: '#315477', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH 2', details: 'Final Fantasy VII Remake Intergrade is available on Nintendo Switch 2, not the original Nintendo Switch.' }] },
    { id: 'psp_15', title: 'Horizon Zero Dawn', genre: 'Action-Adventure', price: 39.99, image: 'horizon_zero_dawn.jpg', color: '#ba5337' },
    { id: 'psp_20', title: 'Stellar Blade', genre: 'Action-Adventure', price: 69.99, image: 'stellar_blade.jpg', color: '#544651' },
    { id: 'psp_13', title: 'Helldivers 2', genre: 'Action-Adventure', price: 39.99, image: 'helldivers_2.jpg', color: '#645d43' },
    { id: 'psp_5', title: 'Final Fantasy XVI', genre: 'RPG', price: 49.99, image: 'final_fantasy_16.jpg', color: '#342e42' },
    { id: 'psp_19', title: 'Ratchet & Clank: Rift Apart', genre: 'Platformer', price: 69.99, image: 'ratchet_and_clank_rift_apart.jpg', color: '#c76b26' },
    { id: 'psp_9', title: 'Ghost of Yotei', genre: 'Action-Adventure', price: 69.99, image: 'ghost_of_yotei.jpg', color: '#b34835' },
    { id: 'psp_22', title: 'The Last of Us Part II', genre: 'Action-Adventure', price: 49.99, image: 'the_last_of_us_part_2.jpg', color: '#536648' },
    { id: 'psp_1', title: 'Astro Bot Rescue Mission', genre: 'Platformer', price: 39.99, image: 'astro_bot_rescue_mission.jpg', color: '#087bff' },
    { id: 'psp_24', title: 'Stardew Valley', genre: 'Simulation', price: 14.99, image: 'StardewValley.jpg', artworkPlatform: 'switch', color: '#244970', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH', details: 'Available on Nintendo Switch.' }, { theme: 'xbox', label: 'XBOX', details: 'Available on Xbox consoles.' }] }
];

const xboxGames = [
    { id: 'xbox_24', title: 'EA SPORTS FC 27', genre: 'Party-Racing', price: 69.99, image: 'ea_sports_fc.jpg', artworkPlatform: 'psp', color: '#18723b', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH', details: 'EA SPORTS FC 27 is available for Nintendo Switch and Nintendo Switch 2.' }, { theme: 'playstation', label: 'PS', details: 'EA SPORTS FC 27 is available on PlayStation 4 and PlayStation 5.' }] },
    { id: 'xbox_25', title: 'Stardew Valley', genre: 'Simulation', price: 14.99, image: 'StardewValley.jpg', artworkPlatform: 'switch', color: '#244970', additionalPlatforms: [{ theme: 'switch', label: 'SWITCH', details: 'Available on Nintendo Switch.' }, { theme: 'playstation', label: 'PS', details: 'Available on PlayStation 4; playable on PlayStation 5 through backward compatibility.' }] },
    { id: 'xbox_1', title: 'Forza Horizon 5', genre: 'Party-Racing', price: 59.99, image: 'forza_horizon_5.jpg', color: '#2088a5' },
    { id: 'xbox_2', title: 'Halo Infinite', genre: 'Action-Adventure', price: 59.99, image: 'halo_infinite.jpg', color: '#496c4c' },
    { id: 'xbox_3', title: 'Sea of Thieves', genre: 'Action-Adventure', price: 39.99, image: 'sea_of_thieves.jpg', color: '#286b7c' },
    { id: 'xbox_4', title: 'DOOM: The Dark Ages', genre: 'Action-Adventure', price: 69.99, image: 'doom_the_dark_ages.jpg', color: '#942e26' },
    { id: 'xbox_5', title: 'Starfield', genre: 'RPG', price: 69.99, image: 'starfield.jpg', color: '#53647e' },
    { id: 'xbox_6', title: 'Gears 5', genre: 'Action-Adventure', price: 39.99, image: 'gears_5.jpg', color: '#a34d38' },
    { id: 'xbox_7', title: 'Alan Wake 2', genre: 'Action-Adventure', price: 49.99, image: 'alan_wake_2.jpg', color: '#4d4d56' },
    { id: 'xbox_8', title: 'Forza Horizon 6', genre: 'Party-Racing', price: 69.99, image: 'forza_horizon_6.jpg', color: '#328da5' },
    { id: 'xbox_9', title: 'Forza Horizon 4', genre: 'Party-Racing', price: 59.99, image: 'forza_horizon_4.jpg', color: '#306777' },
    { id: 'xbox_10', title: 'Forza Motorsport', genre: 'Party-Racing', price: 69.99, image: 'forza_motorsport.jpg', color: '#235c82' },
    { id: 'xbox_11', title: 'Gears of War 3', genre: 'Action-Adventure', price: 19.99, image: 'gears_of_war3.jpg', color: '#783c30' },
    { id: 'xbox_12', title: 'Gears of War: E-Day', genre: 'Action-Adventure', price: 69.99, image: 'gears_of_war_eday.jpg', color: '#713c34' },
    { id: 'xbox_13', title: 'Halo 2', genre: 'Action-Adventure', price: 19.99, image: 'halo_2.jpg', color: '#4b6f61' },
    { id: 'xbox_14', title: 'Halo 3', genre: 'Action-Adventure', price: 19.99, image: 'halo_3.jpg', color: '#536d49' },
    { id: 'xbox_15', title: 'Halo: Campaign Evolved', genre: 'Action-Adventure', price: 59.99, image: 'halo_campaign_evolved.jpg', color: '#456950' },
    { id: 'xbox_16', title: 'Psychonauts 2', genre: 'Platformer', price: 59.99, image: 'psychonauts_2.jpg', color: '#7466a0' },
    { id: 'xbox_17', title: 'Quantum Break', genre: 'Action-Adventure', price: 19.99, image: 'quantum_break.jpg', color: '#416b82' },
    { id: 'xbox_18', title: 'Avowed', genre: 'RPG', price: 69.99, image: 'avowed.jpg', color: '#756a39' },
    { id: 'xbox_19', title: 'Fable II', genre: 'RPG', price: 19.99, image: 'fable_2.jpg', color: '#806044' },
    { id: 'xbox_20', title: 'Fable: The Lost Chapters', genre: 'RPG', price: 14.99, image: 'fable_the_lost_chapters.jpg', color: '#795b38' },
    { id: 'xbox_21', title: 'Sunset Overdrive', genre: 'Action-Adventure', price: 19.99, image: 'sunset_overdrive.jpg', color: '#ca633c' },
    { id: 'xbox_22', title: 'The Outer Worlds', genre: 'RPG', price: 29.99, image: 'the_outer_worlds.jpg', color: '#a26b3a' },
    { id: 'xbox_23', title: 'Star Wars: Knights of the Old Republic', genre: 'RPG', price: 9.99, image: '• star_wars_knights_of_the_old_republic.jpg', color: '#354568' }
];

const researchedGameDetails = {
    switch: {
        "Mario Kart 8 Deluxe": ["Race across imaginative tracks, using items and shortcuts to compete for the finish line.", "ESRB E (Everyone)", "11.3 GB; 11.8 GB in Nintendo Switch 2 compatibility mode", "1-4 local; online multiplayer", "Racing; online tournaments", "Nintendo Switch Online is required for online play.", "https://www.nintendo.com/us/store/products/mario-kart-8-deluxe-switch/"],
        "Animal Crossing: New Horizons": ["Build a home and community on a deserted island, shaping its landscape and daily life at your own pace.", "ESRB E (Everyone)", "10.6 GB", "1-4 local; online features available", "Life simulation; island visits", "Nintendo Switch Online is required for some online features, including visiting other islands.", "https://www.nintendo.com/us/store/products/animal-crossing-new-horizons-switch/"],
        "The Legend of Zelda: Breath of the Wild": ["Explore a vast Hyrule, solve environmental puzzles, and uncover the story of a kingdom in ruins.", "ESRB E10+ (Everyone 10+)", "14.4 GB", "1 player", "Action-adventure; single-player", "No online or co-op mode is listed for the main game.", "https://www.nintendo.com/store/products/the-legend-of-zelda-breath-of-the-wild-switch/"],
        "Super Mario Odyssey": ["Travel across imaginative kingdoms, collect Power Moons, and explore a playful 3D world.", "ESRB E10+ (Everyone 10+)", "5.6 GB", "1-2 local", "3D platformer; local co-op", "No Nintendo Switch Online requirement for the main game.", "https://www.nintendo.com/store/products/super-mario-odyssey-switch/"],
        "Super Smash Bros. Ultimate": ["A crossover fighting game featuring a large roster of familiar characters and fast-paced arena battles.", "ESRB E10+ (Everyone 10+)", "17.3 GB", "1-8 local; online multiplayer", "Fighting; online battles", "Nintendo Switch Online is required for online battles; some characters are paid DLC.", "https://www.nintendo.com/store/products/super-smash-bros-ultimate-switch/"],
        "The Legend of Zelda: Tears of the Kingdom": ["Return to Hyrule for a sprawling adventure with new tools, sky-high exploration, and creative problem-solving.", "ESRB E10+ (Everyone 10+)", "16.5 GB", "1 player", "Action-adventure; single-player", "No online or co-op mode is listed for the main game.", "https://www.nintendo.com/store/products/the-legend-of-zelda-tears-of-the-kingdom-switch/"],
        "Pokémon Scarlet": ["Explore an open region, catch and train Pokémon, and pursue a story-driven journey.", "ESRB E (Everyone)", "9.9 GB", "Multiplayer supported; exact cap not stated on the cited store page", "Role-playing; online trading and battles", "Nintendo Switch Online is required for online trading and battles; paid expansion content is separate.", "https://www.nintendo.com/us/store/products/pokemon-scarlet-switch/"],
        "Pokémon Violet": ["Explore a broad open region, take on challenges, and collect and train Pokémon.", "ESRB E (Everyone)", "9.9 GB", "Multiplayer supported; exact cap not stated on the cited store page", "Role-playing; online trading and battles", "Nintendo Switch Online is required for online trading and battles; paid expansion content is separate.", "https://www.nintendo.com/us/store/products/pokemon-violet-switch/"],
        "Super Mario Bros. Wonder": ["A side-scrolling platform adventure with surprising power-ups, colorful stages, and cooperative play.", "ESRB E (Everyone)", "3.7 GB", "1-4 local", "Platformer; local multiplayer", "Online features may require Nintendo Switch Online.", "https://www.nintendo.com/store/products/super-mario-bros-wonder-switch/"],
        "Super Mario Party": ["A lively party game of board-game turns and mini-games for friends and family.", "ESRB E (Everyone)", "2.9 GB", "1-4 local; online play available for select modes", "Party; board game; mini-games", "Nintendo Switch Online is required for online features when available.", "https://www.nintendo.com/store/products/super-mario-party-switch/"],
        "Pokémon Legends: Arceus": ["Explore an earlier era of a Pokémon region, complete quests, and observe and catch Pokémon in the wild.", "ESRB E (Everyone)", "6.1 GB", "1 player", "Action role-playing; single-player", "Online features are not required for the main campaign.", "https://www.nintendo.com/store/products/pokemon-legends-arceus-switch/"],
        "Stardew Valley": ["Restore a neglected farm, grow crops, explore, and build relationships in a small community.", "ESRB E10+ (Everyone 10+)", "1.5 GB", "1-4 local; online co-op not stated on cited Nintendo page", "Farming/life simulation; local multiplayer", "The official Nintendo listing confirms local multiplayer; online co-op availability varies by version.", "https://www.nintendo.com/store/products/stardew-valley-switch/"],
        "EA SPORTS FC 27": ["EA describes a football experience featuring The Grounds, connecting street and stadium play.", "Not verified for this title", "Not verified", "Not verified", "Football; modes not verified", "Platform-specific availability and player details were not confirmed in the cited sources.", "https://www.ea.com/games/ea-sports-fc/fc-27"],
        "Splatoon 3": ["Compete in colorful ink-based team battles, play a story campaign, and take on cooperative missions.", "ESRB E10+ (Everyone 10+)", "9.9 GB", "Team multiplayer; count varies by mode", "Shooter; Turf War; co-op Salmon Run", "Nintendo Switch Online is required for online play.", "https://www.nintendo.com/store/products/splatoon-3-switch/"],
        "Luigi's Mansion 3": ["Explore a haunted hotel, capture ghosts, and rescue friends across shifting themed floors.", "ESRB E (Everyone)", "7.4 GB", "1-8 local across available modes", "Action-adventure; local co-op and party modes", "Local co-op is supported; no online subscription is required for the main campaign.", "https://www.nintendo.com/store/products/luigis-mansion-3-switch/"],
        "Kirby and the Forgotten Land": ["Explore a mysterious abandoned world, use copy abilities, and clear platforming stages with a friend.", "ESRB E10+ (Everyone 10+)", "5.8 GB", "1-2 local", "Platformer; local co-op", "No Nintendo Switch Online requirement for the main story.", "https://www.nintendo.com/store/products/kirby-and-the-forgotten-land-switch/"],
        "Donkey Kong Country: Tropical Freeze": ["A challenging side-scrolling platformer built around precise jumps, moving hazards, and exploration.", "ESRB E (Everyone)", "6.7 GB", "1-2 local", "Platformer; local co-op", "No online subscription is required for local play.", "https://www.nintendo.com/store/products/donkey-kong-country-tropical-freeze-switch/"],
        "Pikmin 4": ["Guide tiny creatures, solve puzzles, and rescue explorers in a strategic action adventure.", "ESRB E10+ (Everyone 10+)", "11.3 GB", "1-2 local", "Real-time strategy/action; local co-op", "Local co-op is supported; Nintendo Switch Online is not required for the main game.", "https://www.nintendo.com/store/products/pikmin-4-switch/"],
        "Super Mario Maker 2": ["Create and play side-scrolling Mario courses, including stages made by the community.", "ESRB E (Everyone)", "3.1 GB", "1-4 local", "Platformer; level editor; online course sharing", "Online sharing and browsing use Nintendo Switch Online.", "https://www.nintendo.com/store/products/super-mario-maker-2-switch/"],
        "Paper Mario: The Thousand-Year Door": ["A story-rich role-playing adventure with turn-based battles and a paper-crafted world.", "ESRB E (Everyone)", "5.1 GB", "1 player", "Role-playing; single-player", "No online co-op or Nintendo Switch Online requirement for the base game.", "https://www.nintendo.com/store/products/paper-mario-the-thousand-year-door-switch/"],
        "Fire Emblem Engage": ["Command a roster of heroes in a tactical role-playing story about war and mysterious Emblems.", "ESRB T (Teen)", "16.6 GB", "1 player", "Tactical role-playing; single-player", "No co-op mode or online requirement is listed for the main game.", "https://www.nintendo.com/store/products/fire-emblem-engage-switch/"],
        "Xenoblade Chronicles 3": ["A large-scale role-playing adventure about a party's journey through a world shaped by conflict.", "ESRB T (Teen)", "14.4 GB", "1 player", "Action role-playing; single-player", "No co-op mode or Nintendo Switch Online requirement is listed for the main game.", "https://www.nintendo.com/store/products/xenoblade-chronicles-3-switch/"],
        "Metroid Dread": ["A tense action-adventure as Samus explores a hostile alien world while evading a relentless threat.", "ESRB T (Teen)", "4.3 GB", "1 player", "Action-adventure; single-player", "No co-op mode or online requirement is listed for the main story.", "https://www.nintendo.com/store/products/metroid-dread-switch/"]
    },
    psp: {
        "Marvel's Spider-Man 2": ["Peter Parker and Miles Morales defend New York from a symbiote threat in a single-player adventure.", "ESRB M (17+)", "Fixed install size not listed; updates may change it", "1 player", "Action-adventure; single-player", "PS5. No PS Plus requirement listed for the story.", "https://www.playstation.com/en-us/games/marvels-spider-man-2/"],
        "God of War Ragnarök": ["Kratos and Atreus travel across the Nine Realms as Ragnarök approaches, confronting gods and prophecy.", "ESRB M (17+)", "Fixed install size not listed; varies by version and updates", "1 player", "Action-adventure; single-player", "PS4 and PS5. No PS Plus requirement listed for the story.", "https://www.playstation.com/en-us/games/god-of-war-ragnarok/"],
        "Elden Ring: Tarnished Edition": ["Explore the Lands Between as a Tarnished seeking the Elden Ring. The PlayStation catalog entry is the standard Elden Ring release, not the separate Switch 2 Tarnished Edition.", "ESRB M (17+)", "Fixed install size not listed; varies by version and updates", "1 player offline; online co-op and competitive play", "Action role-playing; online multiplayer", "PS4 and PS5. PS Plus is required for online multiplayer, not offline play.", "https://www.playstation.com/en-us/games/elden-ring/"],
        "Ghost of Tsushima": ["Jin Sakai resists the Mongol invasion of Tsushima using samurai combat and the Ghost's unconventional tactics.", "ESRB M (17+)", "Fixed install size not listed; varies by version and updates", "1 player story; Legends online modes", "Action-adventure; online co-op and competitive Rivals", "PS4; PS5 Director's Cut. PS Plus is required for online Legends, not the story.", "https://www.playstation.com/en-us/games/ghost-of-tsushima/"],
        "EA SPORTS FC 27": ["EA describes a football experience featuring The Grounds, a community space connecting street and stadium play.", "Not verified for this title", "Not verified", "Not verified", "Football; modes not verified", "PlayStation availability, rating, and requirements were not confirmed in the checked sources.", "https://www.ea.com/games/ea-sports-fc/fc-27"],
        "Bloodborne": ["A hunter searches plague-stricken Yharnam and confronts its violent mobs and monstrous creatures.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "1 player solo; online co-op and competitive play", "Action role-playing; online multiplayer", "PS4, playable on PS5 via backward compatibility. PS Plus is required for online play.", "https://www.playstation.com/en-us/games/bloodborne/"],
        "The Last of Us Part I": ["Joel escorts Ellie through a world devastated by infection; the remake includes the single-player story and Left Behind.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "1 player", "Action-adventure; single-player", "PS5 edition; does not include the original game's Factions multiplayer.", "https://www.playstation.com/en-us/games/the-last-of-us-part-i/"],
        "Final Fantasy VII Rebirth": ["Cloud and companions leave Midgar and pursue Sephiroth through a wider world in the second entry of the remake project.", "ESRB T (Teen)", "Fixed install size not listed; varies by updates", "1 player", "Role-playing; single-player", "PS5. The official description says it can be played without first playing Remake.", "https://www.playstation.com/en-us/games/final-fantasy-vii-rebirth/"],
        "Horizon Forbidden West": ["Aloy travels west to investigate a blight threatening life on Earth, facing hostile groups and dangerous machines.", "ESRB T (Teen)", "Fixed install size not listed; varies by version and updates", "1 player", "Action-adventure; single-player", "PS4 and PS5. Burning Shores expansion requires the PS5 version.", "https://www.playstation.com/en-us/games/horizon-forbidden-west/"],
        "God of War": ["Kratos and his son Atreus journey through the Norse realms, facing gods and monsters.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "1 player", "Action-adventure; single-player", "PS4; playable on PS5 through backward compatibility.", "https://www.playstation.com/en-us/games/god-of-war/"],
        "Marvel's Spider-Man": ["Peter Parker balances life outside the mask with web-slinging traversal, combat, and a new threat to New York.", "ESRB T (Teen)", "Fixed install size not listed; varies by version and updates", "1 player", "Action-adventure; single-player", "Original is PS4 and backward compatible on PS5; a distinct native PS5 Remastered edition also exists.", "https://www.playstation.com/en-us/games/marvels-spider-man/"],
        "Persona 5 Royal": ["A Tokyo student and fellow outcasts form the Phantom Thieves, challenging corrupt adults in supernatural dungeons.", "ESRB M (17+)", "Fixed install size not listed; varies by version and updates", "1 player", "Role-playing; single-player", "Separate PS4 and PS5 releases; optional network features are included.", "https://www.playstation.com/en-us/games/persona-5-royal/"],
        "Gran Turismo 7": ["A racing simulator with car collecting and tuning, solo play, and competitive online racing.", "ESRB E (Everyone)", "Fixed install size not listed; varies by version and updates", "PS4: 1-2 local and up to 20 online; PS5 listing does not state local count", "Racing; online multiplayer", "PS4 and PS5. PS Plus is required online; PS VR2 is optional on PS5.", "https://store.playstation.com/en-us/product/UP9000-PPSA01317_00-GT7STD0000000PS5"],
        "Uncharted 4: A Thief's End": ["Nathan Drake returns to treasure hunting with his brother Sam in a search for a pirate fortune.", "ESRB T (Teen)", "Fixed install size not listed; varies by version and updates", "1 player; original PS4 listing also included online multiplayer for up to 10", "Action-adventure; online mode details vary by edition", "Original is PS4; a separate PS5 remaster is included in Legacy of Thieves. PS Plus is required for online play in the PS4 version.", "https://www.playstation.com/en-us/games/uncharted-4-a-thiefs-end/"],
        "Final Fantasy VII Remake Intergrade": ["A reimagining of Final Fantasy VII's Midgar story, bundled with INTERmission, a Yuffie-led episode.", "ESRB T (Teen)", "Fixed install size not listed; varies by updates", "1 player", "Role-playing; single-player", "Intergrade is PS5; the PS4 release is a distinct base-game edition.", "https://www.playstation.com/en-us/games/final-fantasy-vii-remake-intergrade/"],
        "Horizon Zero Dawn": ["Hunter Aloy investigates her origins and the past of a future where machines dominate the landscape.", "ESRB T (Teen)", "Fixed install size not listed; varies by edition and updates", "1 player", "Action role-playing; single-player", "Original/Complete Edition is PS4; Remastered is a separate native PS5 edition.", "https://www.playstation.com/en-us/games/horizon-zero-dawn/"],
        "Stellar Blade": ["EVE battles the Naytiba across the remains of Earth on a mission to reclaim the planet.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "1 player", "Action-adventure; single-player", "PS5. No PS Plus or VR requirement listed.", "https://www.playstation.com/en-us/games/stellar-blade/"],
        "Helldivers 2": ["A squad-based shooter where Helldivers cooperate on missions against hostile forces to liberate worlds.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "Online co-op for up to 4", "Shooter; online co-op", "PS5 and PC; online play and PS Plus are required on PlayStation.", "https://www.playstation.com/en-us/games/helldivers-2/"],
        "Final Fantasy XVI": ["Clive Rosfield is drawn into conflict among nations and the powerful Eikons they command.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "1 player", "Action role-playing; single-player", "PS5; no PS4 version listed.", "https://www.playstation.com/en-us/games/final-fantasy-xvi/"],
        "Ratchet & Clank: Rift Apart": ["Ratchet and Clank pursue a robotic emperor across dimensions, joined by resistance fighter Rivet.", "ESRB E10+ (Everyone 10+)", "Store package data is about 39.8 GiB; final installed size may change", "1 player", "Platformer/action-adventure; single-player", "PS5. Internet is needed to download an optional performance-mode update.", "https://store.playstation.com/en-us/product/UP9000-PPSA01473_00-RATCHETCLANKRIFT"],
        "Ghost of Yotei": ["In 1600s Ezo, mercenary Atsu hunts the outlaws who killed her family and encounters a larger purpose.", "ESRB M (17+)", "Fixed install size not listed; varies by updates", "Single-player campaign; Legends has 2-player story co-op and 4-player Incursions", "Action-adventure; online co-op in Legends", "PS5. PS Plus is required for online Legends; the campaign is single-player.", "https://www.playstation.com/en-us/games/ghost-of-yotei/"],
        "The Last of Us Part II": ["After violence shatters Jackson's safety, Ellie sets out on a dangerous pursuit of justice.", "ESRB M (17+)", "PS4 package data about 73 GiB; not a guaranteed installed size; PS5 size not listed", "1 player", "Action-adventure; single-player", "Original is PS4, backward compatible on PS5; Remastered is a separate native PS5 edition.", "https://www.playstation.com/en-us/games/the-last-of-us-part-ii/"],
        "Astro Bot Rescue Mission": ["Guide Astro through rescue missions to find his scattered crew using a virtual-reality perspective.", "ESRB E (Everyone)", "Fixed install size not listed; varies by updates", "1 player", "Platformer; single-player VR", "PS4; requires PlayStation VR headset and PS Camera. PS5 backward compatibility needs the PS4 Camera and adaptor.", "https://www.playstation.com/en-us/games/astro-bot-rescue-mission/"],
        "Stardew Valley": ["Restore an inherited farm, grow crops, explore, and build relationships in the valley.", "ESRB E10+ (Everyone 10+)", "Fixed install size not listed; varies by updates", "1 player or 2-4 player co-op; local split-screen and online", "Farming/life simulation; cooperative multiplayer", "PS4 version, playable on PS5 via backward compatibility. PS Plus is required for online multiplayer.", "https://www.playstation.com/en-us/games/stardew-valley/"]
    },
    xbox: {
        "Forza Horizon 5": ["Explore Mexico in an open-world driving festival with races, events, and changing seasons.", "ESRB E (Everyone)", "Current install size not verified; varies by platform and update", "Solo and online multiplayer up to 12; no local split-screen verified", "Racing; online co-op/convoys and competitive play", "Xbox One and Series X|S. Console online multiplayer requires an eligible Game Pass subscription.", "https://www.xbox.com/en-US/games/store/forza-horizon-5/9NKX70BBCDRN"],
        "Halo Infinite": ["A sci-fi shooter with a Master Chief campaign and a separate free-to-play multiplayer offering.", "ESRB T (Teen)", "Current install size not verified; varies by platform and update", "Campaign solo or online co-op; multiplayer count varies by mode", "Shooter; campaign; competitive and cooperative multiplayer", "Xbox One, Series X|S, and PC. Campaign is separate; online multiplayer is free-to-play.", "https://www.xbox.com/en-US/games/store/halo-infinite/9PP5G1F0C2B6"],
        "Sea of Thieves": ["Sail, explore, and take on voyages in a shared-world pirate adventure.", "ESRB T (Teen)", "Current install size not verified; varies by platform and update", "Solo or online crew up to 4", "Online co-op; player-versus-player encounters", "Xbox One and Series X|S. Online play is required; console multiplayer needs an eligible Game Pass subscription.", "https://www.xbox.com/en-US/games/store/sea-of-thieves/9P2N57MC619K"],
        "DOOM: The Dark Ages": ["A single-player prequel following the Doom Slayer through a medieval-inspired war against Hell.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "1 player", "Shooter; single-player", "Xbox Series X|S. Game Pass access depends on the current tier and catalog.", "https://www.xbox.com/en-US/games/store/doom-the-dark-ages/9PH9X0760B0T"],
        "Starfield": ["Explore settled systems and investigate mysterious artifacts in a single-player space role-playing game.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "1 player", "Role-playing; single-player", "Xbox Series X|S; Xbox One support not listed.", "https://www.xbox.com/en-US/games/store/starfield/9NCJSXWZTP88"],
        "Gears 5": ["Follow Kait Diaz as she investigates her connection to the enemy in a third-person action game.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "Campaign co-op up to 3; online multiplayer up to 10", "Campaign co-op; Horde; Escape; competitive modes", "Xbox One and Series X|S. Campaign supports online or split-screen co-op; online console play needs an eligible Game Pass subscription.", "https://www.xbox.com/en-US/games/store/gears-5/c2kdnlt2h7dm"],
        "Alan Wake 2": ["An FBI agent investigates ritual killings while writer Alan Wake struggles to escape a supernatural nightmare.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "1 player", "Survival horror; single-player", "Xbox Series X|S; no Xbox One version verified.", "https://www.remedygames.com/games/alan-wake-2"],
        "Forza Horizon 6": ["An open-world driving festival set in Japan; release status and final product details were not verified.", "Rating not verified", "Install size not available from checked sources", "Player counts and multiplayer details not verified", "Racing; features not verified", "Announced for 2026; treat availability and final specifications as unverified.", "https://forza.net/news/forza-horizon-6"],
        "Forza Horizon 4": ["Race across a fictionalized Britain in an open-world festival where changing seasons affect events and roads.", "ESRB E (Everyone)", "Current install size not verified; varies by platform and update", "Solo and online multiplayer; no local split-screen verified", "Racing; online co-op/convoys", "Xbox One; backward compatible on Series X|S. Delisted from sale in December 2024; existing owners can still play.", "https://forza.net/games/forza-horizon-4"],
        "Forza Motorsport": ["A track-racing simulator focused on racing careers, car tuning, and circuit competition.", "ESRB E (Everyone)", "Current install size not verified; varies by platform and update", "Single-player and online multiplayer; exact count not verified", "Racing; online multiplayer", "Xbox Series X|S. Local split-screen and Xbox One support were not verified.", "https://forza.net/games/forza-motorsport"],
        "Gears of War 3": ["Marcus Fenix and Delta Squad fight to protect humanity as the Locust war endangers survivors.", "ESRB M (17+)", "Current install size not verified; varies by edition and update", "Campaign solo or online co-op up to 4; split-screen supports fewer players", "Shooter; co-op campaign; versus multiplayer", "Xbox 360 title playable on Xbox One and Series X|S through backward compatibility.", "https://www.gearsofwar.com/"],
        "Gears of War: E-Day": ["A prequel about Marcus Fenix and Dom Santiago confronting the Locust emergence on Emergence Day.", "Rating not verified", "Install size unavailable", "Player count and co-op details not verified", "Shooter; modes not verified", "Announced for 2026; release status and final specifications were not confirmed.", "https://www.gearsofwar.com/"],
        "Halo 2": ["Follow Master Chief and the Arbiter during the human-Covenant war.", "ESRB M (17+)", "Current install size not verified; varies by edition and update", "Original campaign solo or 2-player co-op; multiplayer depends on edition", "Shooter; campaign co-op; edition-dependent multiplayer", "Original Xbox release differs from Halo: The Master Chief Collection on Xbox One and Series X|S.", "https://www.halowaypoint.com/games/halo-2"],
        "Halo 3": ["Master Chief returns to battle the Covenant and the Flood in the concluding chapter of the original trilogy.", "ESRB M (17+)", "Current install size not verified; varies by edition and update", "Campaign solo or up to 4-player co-op; multiplayer depends on edition", "Shooter; campaign co-op; versus multiplayer", "Xbox 360 release and Master Chief Collection editions differ in features and online availability.", "https://www.halowaypoint.com/games/halo-3"],
        "Halo: Campaign Evolved": ["A remake of the original Halo campaign retelling Master Chief's arrival on the ringworld.", "Rating not verified", "Install size unavailable", "Player and co-op details not verified", "Shooter; campaign details not verified", "Announced for 2026; release status and final specifications were not confirmed.", "https://news.xbox.com/en-us/"],
        "Psychonauts 2": ["Psychic trainee Raz explores minds and investigates a conspiracy among the Psychonauts.", "ESRB T (Teen)", "Current install size not verified; varies by platform and update", "1 player", "Platformer; single-player", "Xbox One and Series X|S.", "https://www.doublefine.com/games/psychonauts-2"],
        "Quantum Break": ["Jack Joyce tries to contain a time experiment crisis, with choices linked to live-action story episodes.", "ESRB M (17+)", "Current install size not verified; may vary with installed video content", "1 player", "Action-adventure; single-player", "Xbox One; backward compatible on Series X|S. Live-action episodes may need additional download or streaming data.", "https://www.remedygames.com/games/quantum-break"],
        "Avowed": ["An envoy investigates a spreading plague and a dangerous secret in the fantasy Living Lands.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "1 player", "Role-playing; single-player", "Xbox Series X|S.", "https://www.obsidian.net/games/avowed"],
        "Fable II": ["A fantasy action role-playing adventure where a hero's choices shape life and the world of Albion.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "Solo or 2-player co-op", "Action role-playing; local and online co-op", "Xbox 360; backward compatible on Xbox One and Series X|S.", "https://www.xbox.com/en-US/search/results?q=Fable%20II"],
        "Fable: The Lost Chapters": ["An action role-playing game following a young hero whose choices shape their development and path.", "ESRB M (17+)", "Current install size not verified; varies by edition and update", "1 player", "Action role-playing; single-player", "Original Xbox; check compatibility and availability for the specific edition.", "https://www.xbox.com/en-US/search/results?q=Fable%3A%20The%20Lost%20Chapters"],
        "Sunset Overdrive": ["Traverse a colorful open world and fight mutants after a catastrophe transforms the city.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "Single-player campaign; online co-op up to 8", "Action; online co-op", "Xbox One; backward compatible on Series X|S. Online co-op requires network access.", "https://insomniac.games/game/sunset-overdrive/"],
        "The Outer Worlds": ["Navigate corporate-controlled settlements and consequential choices in a single-player science-fiction RPG.", "ESRB M (17+)", "Current install size not verified; varies by platform and update", "1 player", "Role-playing; single-player", "Xbox One and Series X|S.", "https://www.obsidian.net/games/the-outer-worlds"],
        "Star Wars: Knights of the Old Republic": ["Make choices in a single-player role-playing adventure set in the Star Wars galaxy.", "ESRB T (Teen)", "Current install size not verified; varies by platform and update", "1 player", "Role-playing; single-player", "Original Xbox; backward compatible on Xbox One and Series X|S.", "https://www.xbox.com/en-US/search/results?q=Star%20Wars%3A%20Knights%20of%20the%20Old%20Republic"],
        "Stardew Valley": ["Restore a rural farm, build relationships, and explore nearby areas in a farming and community-life role-playing game.", "ESRB E10+ (Everyone 10+)", "Current install size not verified; varies by platform and update", "Solo or up to 4-player co-op; local/online options vary by version", "Farming/life simulation; co-op", "Xbox One; current Series X|S version details were not verified in the cited listing.", "https://www.stardewvalley.net/"],
        "EA SPORTS FC 27": ["EA describes a football game featuring street and stadium play, with gameplay and mode updates.", "Rating not verified", "Install size unavailable", "Xbox player count and co-op/versus details not verified", "Football; modes not verified", "Xbox availability and release status were not confirmed in the checked official listing.", "https://www.ea.com/games/ea-sports-fc/fc-27"]
    }
};

function attachResearchedDetails(platform, catalog) {
    return catalog.map(game => {
        const entry = researchedGameDetails[platform][game.title];
        if (!entry) {
            console.error(`No researched details found for ${game.title} (${platform}).`);
            return { ...game, platform };
        }

        const [synopsis, rating, storage, players, modes, notes, source] = entry;
        return {
            ...game,
            platform,
            details: {
                synopsis,
                platforms: platform === 'switch' ? 'Nintendo Switch' : platform === 'psp' ? 'PlayStation' : 'Xbox',
                rating,
                storage,
                players,
                modes,
                notes,
                source
            }
        };
    });
}

// Every hub offers a storefront-specific catalog.
function generatePlatformCatalog(platform) {
    if (platform === 'psp') {
        return attachResearchedDetails(platform, playstationGames);
    }
    if (platform === 'xbox') {
        return attachResearchedDetails(platform, xboxGames);
    }

    return attachResearchedDetails('switch', gamesData);
}

function getAllPlatformGames() {
    return [
        ...generatePlatformCatalog('switch'),
        ...generatePlatformCatalog('psp'),
        ...generatePlatformCatalog('xbox')
    ];
}

const PLATFORM_THEMES = ['switch', 'psp', 'xbox'];

// Colors one element (a game card or dialog) with its own platform's accent
function setPlatformThemeClass(element, platform) {
    if (!element) return;
    element.classList.remove(...PLATFORM_THEMES.map(theme => `platform-theme-${theme}`));
    if (PLATFORM_THEMES.includes(platform)) element.classList.add(`platform-theme-${platform}`);
}

// Recolors the whole page (accents, background, header subtitle) without changing the store hub
function applyPageTheme(platform) {
    document.body.classList.remove(...PLATFORM_THEMES.map(theme => `platform-${theme}`));
    document.body.classList.add(`platform-${platform}`);
    document.querySelector('.brand-platform').textContent = {
        switch: 'for Nintendo Switch',
        psp: 'for PlayStation',
        xbox: 'for Microsoft Xbox'
    }[platform];
}

// ECOSYSTEM MENU SWITCH ROUTING CONTROLLER
function switchPlatformEcosystem(platform) {
    if (!['switch', 'psp', 'xbox'].includes(platform)) {
        throw new Error(`Unsupported store hub: ${platform}`);
    }

    const platformChanged = platform !== currentPlatform;
    currentPlatform = platform;
    resetGameSearch();
    closeWishlistView();
    applyPageTheme(platform);
    if (platformChanged) playPlatformWipe(platform);
    playPageEnter('platform');

    document.querySelectorAll('.platform-switcher .platform-btn').forEach(button => {
        const isActive = button.id === `btn-env-${platform}`;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    currentCatalog = generatePlatformCatalog(platform);
    if (!document.getElementById('home-dashboard-view')?.classList.contains('hidden')) {
        renderHomeHighlightsDeck();
    }
    document.querySelectorAll('.genre-btn[data-genre]').forEach(button => {
        button.classList.toggle('active', button.dataset.genre === activeGenre);
    });

    renderActiveGenreView();

    const platformName = { switch: 'Nintendo Switch', psp: 'PlayStation', xbox: 'Xbox' }[platform];
    triggerLiveToastNotification("Ecosystem Shift", `Successfully moved to the ${platformName} game catalog.`);
}

// =========================================================================
// GAME SEARCH: finds games on every platform by title, genre or platform name
// =========================================================================
const gameSearchInput = document.getElementById('gameSearchInput');
const searchStatus = document.getElementById('searchStatus');
// Where to go back to when the search box is cleared
let searchReturnView = null;

// "Pokémon" -> "pokemon", "Spider-Man" -> "spiderman", so accents and punctuation never block a match
function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '');
}

function findGamesMatching(query) {
    const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return getAllPlatformGames().filter(game => {
        const platformName = platformBranding[game.platform]?.name || '';
        const searchable = normalizeSearchText(`${game.title} ${game.genre} ${platformName}`);
        const compact = searchable.replace(/\s+/g, '');
        // Every word must appear; the compact form lets "mariokart" match "Mario Kart"
        return words.every(word => searchable.includes(word) || compact.includes(word));
    });
}

function renderActiveGenreView() {
    if (activeGenre === 'membership') {
        displayMemberships();
    } else if (activeGenre === 'All') {
        displayGames(currentCatalog);
    } else {
        displayGames(currentCatalog.filter(game => game.genre === activeGenre));
    }
}

function runGameSearch() {
    const query = gameSearchInput.value.trim();
    if (!query) {
        endGameSearch();
        return;
    }
    if (!searchReturnView) {
        const onHome = !document.getElementById('home-dashboard-view')?.classList.contains('hidden');
        searchReturnView = onHome ? 'home' : 'catalog';
    }
    closeWishlistView();
    hideHomeDashboard();
    const matches = findGamesMatching(query);
    // If every result is from one platform, dress the page in that platform's colors;
    // mixed results keep the store's theme while each card shows its own platform color
    const resultPlatforms = new Set(matches.map(game => game.platform));
    applyPageTheme(resultPlatforms.size === 1 ? [...resultPlatforms][0] : currentPlatform);
    displayGames(matches);
    const gamesContainer = document.getElementById('gamesContainer');
    gamesContainer.scrollTop = 0;
    searchStatus.classList.remove('hidden');
    searchStatus.classList.toggle('no-results', matches.length === 0);
    searchStatus.textContent = matches.length
        ? `${matches.length} ${matches.length === 1 ? 'game matches' : 'games match'} "${query}" across all platforms`
        : `No games match "${query}". Try a shorter name or a genre like "RPG".`;
}

// Clear the search and go back to the view the player was on before searching
function endGameSearch() {
    const returnView = searchReturnView;
    resetGameSearch();
    if (returnView === 'home') {
        showHomeDashboard();
    } else if (returnView === 'catalog') {
        renderActiveGenreView();
    }
}

// Clear the search box without changing the view (used when the player navigates elsewhere)
function resetGameSearch() {
    if (searchReturnView) applyPageTheme(currentPlatform);
    searchReturnView = null;
    if (gameSearchInput) gameSearchInput.value = '';
    searchStatus?.classList.add('hidden');
}

let gameSearchTimer = null;
gameSearchInput?.addEventListener('input', () => {
    clearTimeout(gameSearchTimer);
    gameSearchTimer = setTimeout(runGameSearch, 150);
});

gameSearchInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gameSearchInput.value) {
        event.preventDefault();
        event.stopPropagation();
        clearTimeout(gameSearchTimer);
        endGameSearch();
    } else if (event.key === 'Enter') {
        clearTimeout(gameSearchTimer);
        runGameSearch();
    }
});

// Press "/" anywhere in the shop to jump to the search box
document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
    if (document.getElementById('shop-screen')?.classList.contains('hidden')) return;
    if (document.querySelector('[role="dialog"]:not(.hidden)')) return;
    event.preventDefault();
    gameSearchInput?.focus();
});

// =========================================================================
// WISHLIST: a heart on every game card and in game details saves the game to the
// player's account; the header heart opens every saved game, plus the upcoming
// games they are watching from the Game Corner
// =========================================================================
const WISHLIST_HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z"></path></svg>';
// Saved as "platform:id" (the same key delivery choices use), newest last
let wishlistKeys = new Set();
let wishlistViewOpen = false;
const wishlistHeader = document.getElementById('wishlistHeader');

function getWishlistKey(game) {
    return `${game.platform || currentPlatform}:${String(game.id)}`;
}

function findGameByWishlistKey(key) {
    const [platform, ...idParts] = String(key).split(':');
    const id = idParts.join(':');
    return getAllPlatformGames().find(game => game.platform === platform && String(game.id) === id) || null;
}

function getWishlistLabel(title, isWishlisted) {
    return isWishlisted ? `Remove ${title} from your wishlist` : `Add ${title} to your wishlist`;
}

function renderWishlistHeart(game) {
    const key = getWishlistKey(game);
    const isWishlisted = wishlistKeys.has(key);
    return `<button type="button" class="wishlist-heart${isWishlisted ? ' is-wishlisted' : ''}" data-wishlist-key="${escapeHtml(key)}" data-wishlist-title="${escapeHtml(game.title)}" aria-pressed="${isWishlisted}" aria-label="${escapeHtml(getWishlistLabel(game.title, isWishlisted))}">${WISHLIST_HEART_SVG}</button>`;
}

function renderWishlistDetailsButton(game) {
    const key = getWishlistKey(game);
    const isWishlisted = wishlistKeys.has(key);
    return `<button type="button" class="btn-secondary game-details-wishlist${isWishlisted ? ' is-wishlisted' : ''}" data-wishlist-key="${escapeHtml(key)}" data-wishlist-title="${escapeHtml(game.title)}" aria-pressed="${isWishlisted}" aria-label="${escapeHtml(getWishlistLabel(game.title, isWishlisted))}">${WISHLIST_HEART_SVG}<span class="wishlist-button-text">${isWishlisted ? 'On your wishlist' : 'Add to wishlist'}</span></button>`;
}

// Upcoming games saved from the Game Corner that are still on the news list
function getWishlistedNewsItems() {
    const newsWishlist = readNewsWishlist();
    return gameNewsItems.filter(item => newsWishlist.has(slugifyNewsTitle(item.title)));
}

// Keeps every heart, details button and the header count in step with the saved list
function updateWishlistControls() {
    document.querySelectorAll('[data-wishlist-key]').forEach(button => {
        const isWishlisted = wishlistKeys.has(button.dataset.wishlistKey);
        button.classList.toggle('is-wishlisted', isWishlisted);
        button.setAttribute('aria-pressed', String(isWishlisted));
        button.setAttribute('aria-label', getWishlistLabel(button.dataset.wishlistTitle, isWishlisted));
        const text = button.querySelector('.wishlist-button-text');
        if (text) text.textContent = isWishlisted ? 'On your wishlist' : 'Add to wishlist';
    });
    const total = wishlistKeys.size + (activeLocalAccountEmail ? getWishlistedNewsItems().length : 0);
    const counter = document.getElementById('wishlistCounter');
    if (counter) counter.textContent = String(total);
    document.getElementById('wishlistBtn')?.classList.toggle('has-items', total > 0);
}

function toggleWishlist(key, trigger) {
    const game = findGameByWishlistKey(key);
    if (!game) {
        console.error(`Unable to find game ${key} for the wishlist.`);
        return;
    }
    const added = !wishlistKeys.has(key);
    if (added) wishlistKeys.add(key);
    else wishlistKeys.delete(key);
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Wishlist not saved', error.message);
    }
    updateWishlistControls();
    if (added && trigger) {
        trigger.classList.remove('just-added');
        void trigger.offsetWidth; // restart the heart pop animation
        trigger.classList.add('just-added');
    }
    if (wishlistViewOpen) renderWishlistView();
    triggerLiveToastNotification(added ? 'Added to wishlist' : 'Removed from wishlist', game.title);
}

function renderWishlistView() {
    if (!wishlistHeader) return;
    const games = [...wishlistKeys].reverse().map(findGameByWishlistKey).filter(Boolean);
    const upcoming = getWishlistedNewsItems();
    const gameCountText = `${games.length} ${games.length === 1 ? 'game' : 'games'} saved`;
    const upcomingRow = upcoming.length ? `
        <div class="wishlist-upcoming">
            <h3>Coming soon you're watching</h3>
            <div class="wishlist-upcoming-row">
                ${upcoming.map(item => {
                    const status = describeNewsStatus(item);
                    return `<button type="button" class="wishlist-upcoming-chip ${getNewsCardTheme(item)}" data-news-slug="${escapeHtml(slugifyNewsTitle(item.title))}">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>${escapeHtml(formatNewsDate(item.date))} · ${escapeHtml(status.label)}</span>
                    </button>`;
                }).join('')}
            </div>
        </div>` : '';
    const emptyState = !games.length && !upcoming.length ? `
        <div class="wishlist-empty">
            <span class="wishlist-empty-icon">${WISHLIST_HEART_SVG}</span>
            <p>Your wishlist is empty. Tap the heart on any game to save it here.</p>
            <button type="button" class="btn-hero-action" data-wishlist-browse>Browse games</button>
        </div>` : '';
    wishlistHeader.innerHTML = `
        <div class="wishlist-header-top">
            <span class="dashboard-eyebrow">WISHLIST</span>
            <h2 id="wishlistTitle">Your wishlist</h2>
            <p>${gameCountText}${upcoming.length ? ` · ${upcoming.length} upcoming` : ''}</p>
        </div>
        ${upcomingRow}
        ${emptyState}
    `;
    wishlistHeader.classList.remove('hidden');
    displayGames(games);
}

function openWishlistView() {
    closeMobileNavigation();
    resetGameSearch();
    hideHomeDashboard();
    wishlistViewOpen = true;
    document.getElementById('wishlistBtn')?.setAttribute('aria-pressed', 'true');
    renderWishlistView();
    document.getElementById('gamesContainer').scrollTop = 0;
    playPageEnter('catalog');
}

// Leaves the wishlist page without changing the view (used when the player navigates elsewhere)
function closeWishlistView() {
    wishlistViewOpen = false;
    wishlistHeader?.classList.add('hidden');
    document.getElementById('wishlistBtn')?.setAttribute('aria-pressed', 'false');
}

document.getElementById('wishlistBtn')?.addEventListener('click', () => {
    if (wishlistViewOpen) showHomeDashboard();
    else openWishlistView();
});

// Hearts live on cards, in game details and on the wishlist page, so one listener handles them all
document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-wishlist-key]') : null;
    if (!button) return;
    toggleWishlist(button.dataset.wishlistKey, button);
});

wishlistHeader?.addEventListener('click', event => {
    const chip = event.target.closest('.wishlist-upcoming-chip');
    if (chip) {
        openNewsDetails(gameNewsItems.find(item => slugifyNewsTitle(item.title) === chip.dataset.newsSlug));
        return;
    }
    if (event.target.closest('[data-wishlist-browse]')) navigateToHomeCatalog();
});

// PHYSICAL PRODUCT DELIVERIES AND DIGITAL PROMO CODE TOGGLES
function setGameDeliveryMode(gameId, selectionMode, platform = currentPlatform) {
    if (!['physical', 'digital'].includes(selectionMode)) {
        throw new Error(`Unsupported delivery mode: ${selectionMode}`);
    }

    const normalizedId = String(gameId);
    selectedDeliveryModes.set(`${platform}:${normalizedId}`, selectionMode);
    try {
        persistActiveLocalAccount();
    } catch (error) {
        triggerLiveToastNotification('Delivery option not saved', error.message);
    }
    document.querySelectorAll('.delivery-chip[data-game-id]').forEach(button => {
        if (button.dataset.gameId !== normalizedId || button.dataset.platform !== platform) return;
        const isSelected = button.dataset.deliveryMode === selectionMode;
        button.classList.toggle('active', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });

    const message = selectionMode === 'physical'
        ? "Disc/Card selected."
        : "Promo Code selected.";
    triggerLiveToastNotification("Distribution Variant Set", message);
}

// LIVE IN-APP TOAST ALERT PAYLOAD POPUPS DISPATCHER
function triggerLiveToastNotification(title, message) {
    const containerTray = document.getElementById('notificationCenterTray');
    if (!containerTray) return;
    
    const toastCard = document.createElement('div');
    toastCard.className = 'toast-notif-card';
       const toastTitle = document.createElement('h5');
    toastTitle.textContent = title;
    const toastBody = document.createElement('p');
    toastBody.textContent = message;
    toastCard.append(toastTitle, toastBody);
    
    containerTray.appendChild(toastCard);
    setTimeout(() => toastCard.classList.add('active'), 40);
    
    // Automatically fade out notification container elements safely after 5 seconds
    setTimeout(() => {
        toastCard.classList.remove('active');
        setTimeout(() => toastCard.remove(), 400);
    }, 5000);
}
// =========================================================================
// GAME CORNER: upcoming releases, recent releases and console news
// To add or edit news, change the list below. Whether a game shows under
// "Coming soon" or "Just released" is worked out from its date automatically.
//   type: 'game' (a release) or 'console' (platform news)
//   date: 'YYYY-MM-DD'     big: true shows it in the countdown cards at the top
//   storeTitle + storePlatform (optional): adds a "View in store" button
// Facts checked on October 13, 2026.
// =========================================================================
const GAME_NEWS_UPDATED = '2026-10-13';

const NEWS_PLATFORM = {
    switch2: { key: 'switch', label: 'Switch 2' },
    switch: { key: 'switch', label: 'Switch' },
    ps5: { key: 'psp', label: 'PS5' },
    xbox: { key: 'xbox', label: 'Xbox' }
};

const gameNewsItems = [
    // ----- Coming soon -----
    { type: 'game', date: '2026-10-16', title: 'Resident Evil 2, 3 and 4', imageSlug: 'resident-evil-remake-trilogy', platforms: [NEWS_PLATFORM.switch2],
      blurb: "Capcom's survival horror classics all arrive on Nintendo Switch 2 on the same day." },
    { type: 'game', date: '2026-10-22', title: 'Nintendo Switch Sports Resort', platforms: [NEWS_PLATFORM.switch2],
      blurb: 'A new Switch Sports game made for Nintendo Switch 2.' },
    { type: 'game', date: '2026-10-23', title: 'Call of Duty: Modern Warfare 4', platforms: [NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox],
      blurb: 'The next Call of Duty launches on PlayStation and Xbox, along with PC.' },
    { type: 'game', date: '2026-10-27', title: 'Minecraft: Switch 2 Edition', platforms: [NEWS_PLATFORM.switch2],
      blurb: 'Minecraft gets its own dedicated edition for Nintendo Switch 2.' },
    { type: 'game', date: '2026-10-29', title: 'Phantom Blade Zero', platforms: [NEWS_PLATFORM.ps5],
      blurb: 'A fast, stylish martial-arts action game launching on PS5 and PC.' },
    { type: 'game', date: '2026-11-05', title: 'The Legend of Zelda: Ocarina of Time', platforms: [NEWS_PLATFORM.switch2], big: true,
      blurb: "Nintendo's remake of the 1998 classic is a Switch 2 exclusive. Its date was revealed at the Zelda 40th Anniversary Direct." },
    { type: 'game', date: '2026-11-19', title: 'Grand Theft Auto VI', platforms: [NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox], big: true,
      blurb: "Rockstar's Vice City return launches on PS5 and Xbox Series X|S. Digital pre-load opens November 12." },
    { type: 'game', date: '2026-12-03', title: 'Dragon Quest Monsters: The Withered World', platforms: [NEWS_PLATFORM.switch, NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox],
      blurb: 'The monster-collecting RPG spin-off arrives on Switch, PlayStation and Xbox.' },

    // ----- Just released -----
    { type: 'game', date: '2026-10-13', title: 'Planet Zoo 2', platforms: [NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox],
      blurb: "Frontier's zoo-building sequel launches on PS5, Xbox Series X|S and PC." },
    { type: 'game', date: '2026-10-06', title: 'Gears of War: E-Day', platforms: [NEWS_PLATFORM.xbox], storeTitle: 'Gears of War: E-Day', storePlatform: 'xbox',
      blurb: 'The prequel to the original Gears is out on Xbox and PC, and is on Game Pass Ultimate from day one.' },
    { type: 'game', date: '2026-10-06', title: 'Star Wars: Galactic Racer', platforms: [NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox],
      blurb: 'A Star Wars racing game for PS5, Xbox and PC.' },
    { type: 'game', date: '2026-10-06', title: 'Disney Epic Mickey: Rebrushed', platforms: [NEWS_PLATFORM.switch2],
      blurb: 'The remastered platformer is now available on Nintendo Switch 2.' },
    { type: 'game', date: '2026-09-15', title: "Marvel's Wolverine", platforms: [NEWS_PLATFORM.ps5],
      blurb: "Insomniac's PS5-exclusive claws-out action game is out now, with mixed to generally positive reviews." },

    // ----- Console news -----
    { type: 'console', date: '2026-11-12', title: 'GTA VI pre-load opens', imageSlug: 'grand-theft-auto-vi', platforms: [NEWS_PLATFORM.ps5, NEWS_PLATFORM.xbox],
      blurb: 'Digital pre-orders can download Grand Theft Auto VI a week before it launches on PS5 and Xbox Series X|S.' },
    { type: 'console', date: '2026-10-06', title: 'Game Pass October lineup', imageSlug: 'gears-of-war-e-day', platforms: [NEWS_PLATFORM.xbox],
      blurb: 'Gears of War: E-Day leads the October additions, playable on day one with Game Pass Ultimate and PC Game Pass.' },
    { type: 'console', date: '2026-09-15', title: 'Wolverine PS5 hardware', imageSlug: 'marvels-wolverine', platforms: [NEWS_PLATFORM.ps5],
      blurb: 'Limited-edition Marvel\'s Wolverine PS5 hardware and accessories arrived alongside the game.' },
    { type: 'console', date: '2026-09-08', title: 'Zelda 40th Anniversary Direct', imageSlug: 'the-legend-of-zelda-ocarina-of-time', platforms: [NEWS_PLATFORM.switch2],
      blurb: "Nintendo revealed Ocarina of Time's November 5 release date and showed its first real gameplay." }
];

// Pictures: the news cards look for each game's picture in images/released_games/
// (and then in images/news/). The file name can be the game title written in any of these styles:
//   grand_theft_auto_vi.jpg   grand-theft-auto-vi.jpg   grandtheftautovi.jpg   GrandTheftAutoVi.jpg
// jpg, jpeg, png and webp all work. If no file is found, the card simply shows without a picture.
const NEWS_IMAGE_FOLDERS = ['images/released_game', 'images/news'];
const NEWS_IMAGE_EXTENSIONS = ['jpg', 'png', 'webp', 'jpeg'];

function slugifyNewsTitle(title) {
    return String(title).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getNewsImageSlug(item) {
    if (item.imageSlug) return item.imageSlug;
    return item.type === 'game' ? slugifyNewsTitle(item.title) : '';
}

// Every file name we will try, in order, for one picture
function getNewsArtCandidates(slug, storeGame) {
    // Games sold in the store reuse their catalog cover
    if (storeGame) return [getGameImagePath(storeGame.artworkPlatform || storeGame.platform, storeGame.image)];
    if (!slug) return [];
    const words = slug.split('-').filter(Boolean);
    const names = [
        words.join('_'),
        slug,
        words.join(''),
        words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
    ];
    const candidates = [];
    NEWS_IMAGE_FOLDERS.forEach(folder => names.forEach(name => NEWS_IMAGE_EXTENSIONS.forEach(extension => {
        candidates.push(`${folder}/${name}.${extension}`);
    })));
    return candidates;
}

function renderNewsArtImage(candidates) {
    return `<img src="${escapeHtml(candidates[0])}" alt="" loading="lazy" data-candidates="${escapeHtml(JSON.stringify(candidates))}" data-candidate-index="0">`;
}

let activeNewsTab = 'upcoming';

function parseNewsDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function daysUntilNewsDate(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((parseNewsDate(dateString) - today) / 86400000);
}

function formatNewsDate(dateString) {
    return parseNewsDate(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function describeNewsStatus(item) {
    const days = daysUntilNewsDate(item.date);
    if (item.type === 'console') {
        if (days > 0) return { label: days === 1 ? 'Tomorrow' : `In ${days} days`, className: 'is-news' };
        return { label: 'Console news', className: 'is-news' };
    }
    if (days > 1) return { label: `In ${days} days`, className: 'is-soon' };
    if (days === 1) return { label: 'Tomorrow', className: 'is-soon' };
    if (days === 0) return { label: 'Out today', className: 'is-out' };
    return { label: 'Out now', className: 'is-out' };
}

function getNewsCardTheme(item) {
    const keys = [...new Set(item.platforms.map(platform => platform.key))];
    return keys.length === 1 ? `news-theme-${keys[0]}` : 'news-theme-multi';
}

function renderNewsPlatformChips(item) {
    return item.platforms.map(platform => {
        const logo = platformBranding[platform.key]?.logo || '';
        return `<span class="news-chip"><img src="${escapeHtml(logo)}" alt="" aria-hidden="true">${escapeHtml(platform.label)}</span>`;
    }).join('');
}

function findStoreGameForNews(item) {
    if (!item.storeTitle) return null;
    return getAllPlatformGames().find(game => game.title === item.storeTitle && game.platform === item.storePlatform) || null;
}

// The slim strip at the very top: every news item, soonest releases first, then the most
// recent ones. Kept quiet on purpose; clicking an item opens its Game Corner details.
const NEWS_TICKER_PX_PER_SECOND = 26;

function renderNewsTicker() {
    const wrap = document.getElementById('newsTicker');
    if (!wrap) return;
    const items = [...gameNewsItems].sort((a, b) => {
        const daysA = daysUntilNewsDate(a.date);
        const daysB = daysUntilNewsDate(b.date);
        if ((daysA >= 0) !== (daysB >= 0)) return daysA >= 0 ? -1 : 1;
        return daysA >= 0 ? daysA - daysB : daysB - daysA;
    });
    const renderItem = (item, focusable) => {
        const platformKeys = [...new Set(item.platforms.map(platform => platform.key))];
        const platformNames = item.platforms.map(platform => platform.label).join(', ');
        return `<button type="button" class="ticker-item" data-news-slug="${escapeHtml(slugifyNewsTitle(item.title))}"${focusable ? '' : ' tabindex="-1"'} aria-label="${escapeHtml(`${item.title}, ${describeNewsStatus(item).label}, ${platformNames}`)}">
            <span class="ticker-dots" aria-hidden="true">${platformKeys.map(key => `<span class="ticker-dot ticker-dot-${key}"></span>`).join('')}</span>
            <span class="ticker-title">${escapeHtml(item.title)}</span>
            <span class="ticker-meta">${escapeHtml(describeNewsStatus(item).label)}</span>
        </button>`;
    };
    // Two identical tracks scroll together so the loop has no visible seam
    const renderTrack = isCopy => `<div class="ticker-track"${isCopy ? ' aria-hidden="true"' : ''}>
        <span class="ticker-label">Game news</span>
        ${items.map(item => renderItem(item, !isCopy)).join('<span class="ticker-sep" aria-hidden="true"></span>')}
    </div>`;
    wrap.innerHTML = renderTrack(false) + renderTrack(true);
}

// Keep the scroll at a steady, slow reading speed however much news there is
const newsTickerWrap = document.getElementById('newsTicker');
if (newsTickerWrap && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
        const trackWidth = newsTickerWrap.firstElementChild?.getBoundingClientRect().width || 0;
        if (trackWidth) newsTickerWrap.style.animationDuration = `${Math.round(trackWidth / NEWS_TICKER_PX_PER_SECOND)}s`;
    }).observe(newsTickerWrap);
}
newsTickerWrap?.addEventListener('click', event => {
    const button = event.target.closest('.ticker-item');
    if (!button) return;
    openNewsDetails(gameNewsItems.find(item => slugifyNewsTitle(item.title) === button.dataset.newsSlug));
});
renderNewsTicker();

let renderedNewsItems = [];

function renderGameCorner() {
    const grid = document.getElementById('gameCornerGrid');
    const spotlight = document.getElementById('gameCornerSpotlight');
    if (!grid || !spotlight) return;

    const updated = document.getElementById('gameCornerUpdated');
    if (updated) updated.textContent = `Updated ${formatNewsDate(GAME_NEWS_UPDATED)}`;

    // Countdown cards for the biggest upcoming releases
    const bigReleases = gameNewsItems
        .filter(item => item.type === 'game' && item.big && daysUntilNewsDate(item.date) > 0)
        .sort((a, b) => parseNewsDate(a.date) - parseNewsDate(b.date))
        .slice(0, 2);
    spotlight.innerHTML = bigReleases.map(item => {
        const days = daysUntilNewsDate(item.date);
        return `
            <article class="spotlight-card ${getNewsCardTheme(item)}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="View details for ${escapeHtml(item.title)}" data-news-title="${escapeHtml(item.title)}">
                <div class="spotlight-count"><strong>${days}</strong><span>${days === 1 ? 'day to go' : 'days to go'}</span></div>
                <div class="spotlight-info">
                    <div class="news-platforms">${renderNewsPlatformChips(item)}</div>
                    <h4>${escapeHtml(item.title)}</h4>
                    <p class="news-date">${escapeHtml(formatNewsDate(item.date))}</p>
                </div>
            </article>`;
    }).join('');
    spotlight.classList.toggle('hidden', bigReleases.length === 0);

    // Cards for the selected tab
    const isGame = item => item.type === 'game';
    renderedNewsItems = gameNewsItems.filter(item => {
        const days = daysUntilNewsDate(item.date);
        if (activeNewsTab === 'upcoming') return isGame(item) && days > 0;
        if (activeNewsTab === 'released') return isGame(item) && days <= 0;
        return item.type === 'console';
    }).sort((a, b) => (activeNewsTab === 'upcoming'
        ? parseNewsDate(a.date) - parseNewsDate(b.date)
        : parseNewsDate(b.date) - parseNewsDate(a.date)));

    grid.innerHTML = renderedNewsItems.length ? renderedNewsItems.map((item, index) => {
        const status = describeNewsStatus(item);
        const storeGame = findStoreGameForNews(item);
        const slug = getNewsImageSlug(item);
        const candidates = getNewsArtCandidates(slug, storeGame);
        const artHtml = candidates.length ? `<div class="news-card-art">${renderNewsArtImage(candidates)}</div>` : '';
        return `
            <article class="news-card ${getNewsCardTheme(item)}" data-news-index="${index}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="View details for ${escapeHtml(item.title)}">
                ${artHtml}
                <div class="news-card-top">
                    <div class="news-platforms">${renderNewsPlatformChips(item)}</div>
                    <span class="news-status ${status.className}">${escapeHtml(status.label)}</span>
                </div>
                <h4>${escapeHtml(item.title)}</h4>
                <p class="news-date">${escapeHtml(formatNewsDate(item.date))}</p>
                <p class="news-blurb">${escapeHtml(item.blurb)}</p>
                <div class="news-card-footer">
                    <span class="news-more">View details</span>
                    ${storeGame ? `<button type="button" class="platform-guide-link news-store-link" data-store-id="${escapeHtml(String(storeGame.id))}" data-store-platform="${escapeHtml(storeGame.platform)}">View in store</button>` : ''}
                </div>
            </article>`;
    }).join('') : '<p class="account-help-text">Nothing here yet. Check back soon.</p>';

    document.querySelectorAll('.game-corner-tab').forEach(tab => {
        tab.setAttribute('aria-pressed', String(tab.dataset.newsTab === activeNewsTab));
    });
}

document.querySelectorAll('.game-corner-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        activeNewsTab = tab.dataset.newsTab;
        renderGameCorner();
    });
});

// =========================================================================
// GAME CORNER DETAILS: what opens when you click a news card
// Each entry is named after the news title in lowercase with dashes
// (the same name as the picture file). You can edit any value below.
//   rating / ratingText : ESRB label, leave out if not rated yet
//   wishlist, reviews, userScore : the numbers shown in the stats boxes
//   (the wishlist, review and score numbers are placeholder figures for the shop)
// =========================================================================
const gameNewsDetails = {
    'resident-evil-2-3-and-4': {
        description: "Capcom's three modern survival horror remakes arrive on Nintendo Switch 2 together. Scrape by in the ruined streets of Raccoon City in Resident Evil 2 and 3, then take on Leon's mission in Resident Evil 4.",
        rating: 'M', ratingText: 'Mature 17+', developer: 'Capcom', publisher: 'Capcom', genre: 'Survival horror', players: '1 player',
        highlights: ['All three games launch on the same day', 'Tense survival horror with puzzles, scarce ammo and big boss fights'],
        wishlist: 318400
    },
    'nintendo-switch-sports-resort': {
        description: "Nintendo's next Switch Sports game, made for Nintendo Switch 2. Easy-to-learn sports for quick matches with friends and family.",
        developer: 'Nintendo', publisher: 'Nintendo', genre: 'Sports and party',
        highlights: ['Made for Nintendo Switch 2', 'Quick rounds that anyone can pick up'],
        wishlist: 205900
    },
    'call-of-duty-modern-warfare-4': {
        description: 'The next game in the long-running Modern Warfare line of Call of Duty, launching on PlayStation, Xbox and PC.',
        rating: 'M', ratingText: 'Mature 17+', developer: 'Infinity Ward', publisher: 'Activision', genre: 'First-person shooter',
        highlights: ['Launches October 23', 'Campaign and online multiplayer'],
        wishlist: 1204700
    },
    'minecraft-switch-2-edition': {
        description: 'The block-building sandbox gets its own dedicated edition for Nintendo Switch 2. Build, explore and survive on your own or with friends.',
        rating: 'E10+', ratingText: 'Everyone 10+', developer: 'Mojang Studios', publisher: 'Xbox Game Studios', genre: 'Sandbox and survival',
        highlights: ['A dedicated edition for Nintendo Switch 2', 'Launches October 27'],
        wishlist: 689300
    },
    'phantom-blade-zero': {
        description: "A dark wuxia action RPG from China's S-GAME Studio, built around fast martial-arts combat and a single-player story led by action star Donnie Yen.",
        rating: 'M', ratingText: 'Mature 17+', developer: 'S-GAME Studio', publisher: 'S-GAME', genre: 'Action RPG', players: '1 player',
        highlights: ['Built on Unreal Engine 5', 'Pre-orders opened on August 11', 'No Xbox version has been announced'],
        wishlist: 842500
    },
    'the-legend-of-zelda-ocarina-of-time': {
        description: "Nintendo's remake of the 1998 classic takes Link back to Hyrule with updated visuals and designs. It is exclusive to Nintendo Switch 2.",
        rating: 'E10+', ratingText: 'Everyone 10+ (animated blood, fantasy violence)', developer: 'Nintendo', publisher: 'Nintendo', genre: 'Action-adventure', players: '1 player',
        highlights: ['You can hum the ocarina songs into your Switch 2 instead of using button prompts', 'Revealed in June 2026, dated at the Zelda 40th Anniversary Direct'],
        wishlist: 1846200
    },
    'grand-theft-auto-vi': {
        description: "Rockstar's next open-world action-adventure takes you to the state of Leonida and Vice City, playing as Jason and Lucia.",
        rating: 'M', ratingText: 'Mature 17+', developer: 'Rockstar Games', publisher: 'Rockstar Games', genre: 'Open-world action-adventure', players: '1 player',
        highlights: ['Digital pre-load opens November 12', 'PS5 and Xbox Series X|S only for now, with no PC date announced', 'Delayed twice before settling on November 19'],
        wishlist: 4382900
    },
    'dragon-quest-monsters-the-withered-world': {
        description: 'A Dragon Quest spin-off where you befriend monsters, raise them and send them into battle beside you.',
        developer: 'Square Enix', publisher: 'Square Enix', genre: 'Monster-collecting RPG',
        highlights: ['Launches on Switch, Switch 2, PS5 and Xbox', 'Also coming to PC'],
        wishlist: 276500
    },
    'planet-zoo-2': {
        description: "Build, run and care for your own zoo in Frontier's sequel to the popular zoo-management sim.",
        developer: 'Frontier Developments', publisher: 'Frontier Developments', genre: 'Construction and management sim',
        highlights: ['Announced in November 2025', 'Out on PS5, Xbox Series X|S and PC'],
        wishlist: 391800, reviews: 4120, userScore: 4.5
    },
    'gears-of-war-e-day': {
        description: 'The prequel to the original Gears of War returns to Emergence Day, when Marcus Fenix and Dom Santiago face the first attack of the Locust Horde.',
        rating: 'M', ratingText: 'Mature 17+', developer: 'The Coalition', publisher: 'Xbox Game Studios', genre: 'Third-person shooter', players: 'Solo, split-screen and 4-player online co-op',
        highlights: ['Day-one on Game Pass Ultimate and PC Game Pass', '12-player Horde Siege and 4v4 Versus modes', 'Set 14 years before the original Gears of War'],
        wishlist: 733100, reviews: 12480, userScore: 4.7
    },
    'star-wars-galactic-racer': {
        description: 'A Star Wars racing game for PlayStation 5, Xbox Series X|S and PC.',
        genre: 'Racing',
        highlights: ['Out now on PS5, Xbox and PC'],
        wishlist: 148200, reviews: 2860, userScore: 4.1
    },
    'disney-epic-mickey-rebrushed': {
        description: 'A remastered take on the Disney platformer where Mickey uses a magic paintbrush to paint and thin his way through the Wasteland.',
        rating: 'E10+', ratingText: 'Everyone 10+', developer: 'Purple Lamp Studios', publisher: 'THQ Nordic', genre: 'Platformer', players: '1 player',
        highlights: ['Now available on Nintendo Switch 2'],
        wishlist: 112900, reviews: 1930, userScore: 4.2
    },
    'marvels-wolverine': {
        description: "Insomniac's PS5-exclusive action game puts you in Wolverine's claws, taking on Team X, Omega Red and Bolivar Trask's Sentinels in a gritty, adults-only story.",
        rating: 'M', ratingText: 'Mature 17+', developer: 'Insomniac Games', publisher: 'Sony Interactive Entertainment', genre: 'Action-adventure', players: '1 player',
        highlights: ['Released September 15, 2026', 'Enhanced for PS5 Pro', 'Reviews are mixed to generally positive'],
        wishlist: 2104600, reviews: 18730, userScore: 4.0
    },

    // ----- Console news -----
    'gta-vi-pre-load-opens': {
        description: 'Digital pre-orders can start downloading Grand Theft Auto VI on November 12, a week before it launches on November 19, so it is ready to play when it unlocks.',
        highlights: ['Available on PS5 and Xbox Series X|S', 'No PC release date has been announced']
    },
    'game-pass-october-lineup': {
        description: 'Xbox Game Pass adds Gears of War: E-Day on day one for Game Pass Ultimate and PC Game Pass, as part of its October lineup.',
        highlights: ['Gears of War: E-Day launched October 6', 'Also playable through Xbox Play Anywhere on console and PC']
    },
    'wolverine-ps5-hardware': {
        description: "A limited-edition Marvel's Wolverine PS5 console bundle and accessories were released alongside the game.",
        highlights: ['Released alongside the game on September 15']
    },
    'zelda-40th-anniversary-direct': {
        description: "On September 8, Nintendo held a Direct for Zelda's 40th anniversary. It revealed the November 5 release date of the Ocarina of Time remake and showed its first real gameplay.",
        highlights: ['Ocarina of Time arrives November 5 on Nintendo Switch 2', 'First proper gameplay footage shown']
    }
};

const WISHLIST_STORAGE_KEY = 'ninexpo.wishlist.v1';
const newsDialog = document.getElementById('newsDetailsDialog');
let currentNewsItem = null;
let newsDialogReturnFocus = null;

// Upcoming games are saved on the signed-in account. Accounts that have not saved any yet
// start from the older browser-wide list (WISHLIST_STORAGE_KEY), so nothing is lost.
function readNewsWishlist() {
    try {
        const account = getActiveLocalAccount();
        if (account && Array.isArray(account.newsWishlist)) return new Set(account.newsWishlist);
        const saved = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || '[]');
        return new Set(Array.isArray(saved) ? saved : []);
    } catch (error) {
        return new Set();
    }
}

function writeNewsWishlist(wishlist) {
    try {
        const accounts = activeLocalAccountEmail ? readLocalAccounts() : null;
        const account = accounts?.[activeLocalAccountEmail];
        if (account) {
            account.newsWishlist = [...wishlist];
            writeLocalAccounts(accounts);
        } else {
            localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([...wishlist]));
        }
    } catch (error) {
        console.error('Wishlist could not be saved:', error);
        triggerLiveToastNotification('Wishlist not saved', error.message);
    }
}

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function renderNewsStats(details, isWishlisted, isUpcoming) {
    const tiles = [];
    if (details.wishlist) {
        const total = details.wishlist + (isWishlisted ? 1 : 0);
        tiles.push(`<div class="news-stat"><strong title="${total.toLocaleString('en-US')}">${compactNumber.format(total)}</strong><span>players added it to their wishlist</span></div>`);
    }
    if (details.userScore) {
        tiles.push(`<div class="news-stat"><strong>${details.userScore.toFixed(1)} / 5</strong><span>from ${compactNumber.format(details.reviews || 0)} player reviews</span></div>`);
    }
    if (details.wishlist && isUpcoming) {
        const hype = Math.min(100, Math.round(Math.sqrt(details.wishlist / 4500000) * 100));
        tiles.push(`<div class="news-stat"><strong>${hype}%</strong><span>hype</span><div class="news-hype-bar" aria-hidden="true"><i style="width:${hype}%"></i></div></div>`);
    }
    return tiles.join('');
}

function updateNewsWishlistButton() {
    const button = document.getElementById('newsWishlistBtn');
    if (!button || !currentNewsItem) return;
    const details = gameNewsDetails[slugifyNewsTitle(currentNewsItem.title)] || {};
    const isWishlisted = readNewsWishlist().has(slugifyNewsTitle(currentNewsItem.title));
    button.hidden = !details.wishlist;
    button.textContent = isWishlisted ? 'On your wishlist' : 'Add to wishlist';
    button.setAttribute('aria-pressed', String(isWishlisted));
    button.classList.toggle('is-active', isWishlisted);
    document.getElementById('newsDialogStats').innerHTML =
        renderNewsStats(details, isWishlisted, daysUntilNewsDate(currentNewsItem.date) > 0);
}

function openNewsDetails(item) {
    if (!item || !newsDialog) return;
    currentNewsItem = item;
    newsDialogReturnFocus = document.activeElement;

    const slug = slugifyNewsTitle(item.title);
    const details = gameNewsDetails[slug] || {};
    const status = describeNewsStatus(item);
    const storeGame = findStoreGameForNews(item);
    const imageSlug = getNewsImageSlug(item);

    const art = document.getElementById('newsDialogArt');
    const candidates = getNewsArtCandidates(imageSlug, storeGame);
    if (candidates.length) {
        art.innerHTML = renderNewsArtImage(candidates);
        art.classList.remove('hidden');
    } else {
        art.innerHTML = '';
        art.classList.add('hidden');
    }

    document.getElementById('newsDialogPlatforms').innerHTML = renderNewsPlatformChips(item);
    const statusElement = document.getElementById('newsDialogStatus');
    statusElement.textContent = status.label;
    statusElement.className = `news-status ${status.className}`;
    document.getElementById('newsDialogTitle').textContent = item.title;
    const ratingBadge = document.getElementById('newsDialogRating');
    ratingBadge.textContent = details.rating || '';
    ratingBadge.title = details.ratingText ? `ESRB: ${details.ratingText}` : '';
    ratingBadge.classList.toggle('hidden', !details.rating);
    document.getElementById('newsDialogDate').textContent =
        `${item.type === 'console' ? (daysUntilNewsDate(item.date) > 0 ? 'Happening' : 'Announced') : (daysUntilNewsDate(item.date) > 0 ? 'Releases' : 'Released')} ${formatNewsDate(item.date)}`;
    document.getElementById('newsDialogDescription').textContent = details.description || item.blurb;

    const facts = [
        ['Age rating', item.type === 'game' ? (details.rating ? `ESRB ${details.rating}: ${details.ratingText}` : 'Not yet rated') : ''],
        ['Developer', details.developer],
        ['Publisher', details.publisher],
        ['Genre', details.genre],
        ['Players', details.players]
    ].filter(([, value]) => value);
    document.getElementById('newsDialogFacts').innerHTML = facts
        .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    const highlights = document.getElementById('newsDialogHighlights');
    highlights.innerHTML = (details.highlights || []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    highlights.classList.toggle('hidden', !(details.highlights || []).length);

    const storeButton = document.getElementById('newsStoreBtn');
    storeButton.hidden = !storeGame;
    storeButton.onclick = storeGame ? () => { closeNewsDetails(false); openHomeGameDetails(storeGame); } : null;

    updateNewsWishlistButton();
    cancelDialogClose(newsDialog);
    newsDialog.classList.remove('hidden');
    document.getElementById('closeNewsDialog').focus();
    newsDialog.querySelector('.news-dialog-panel').scrollTop = 0;
}

function closeNewsDetails(restoreFocus = true) {
    if (!newsDialog) return;
    closeDialogAnimated(newsDialog);
    currentNewsItem = null;
    if (restoreFocus && newsDialogReturnFocus?.isConnected) newsDialogReturnFocus.focus();
    newsDialogReturnFocus = null;
}

function handleNewsImageError(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.candidates) return;
    let candidates = [];
    try {
        candidates = JSON.parse(image.dataset.candidates);
    } catch (error) {
        candidates = [];
    }
    const nextIndex = Number(image.dataset.candidateIndex) + 1;
    if (nextIndex < candidates.length) {
        image.dataset.candidateIndex = String(nextIndex);
        image.src = candidates[nextIndex];
        return;
    }
    const cardArt = image.closest('.news-card-art');
    if (cardArt) {
        cardArt.remove();
    } else {
        image.closest('.news-dialog-art')?.classList.add('hidden');
    }
}

const newsGridElement = document.getElementById('gameCornerGrid');
const newsSpotlightElement = document.getElementById('gameCornerSpotlight');
newsGridElement?.addEventListener('error', handleNewsImageError, true);
document.getElementById('newsDialogArt')?.addEventListener('error', handleNewsImageError, true);

newsGridElement?.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const storeLink = target.closest('.news-store-link');
    if (storeLink) {
        const game = getAllPlatformGames().find(item =>
            String(item.id) === storeLink.dataset.storeId && item.platform === storeLink.dataset.storePlatform);
        if (game) openHomeGameDetails(game);
        return;
    }
    const card = target.closest('.news-card');
    if (card) openNewsDetails(renderedNewsItems[Number(card.dataset.newsIndex)]);
});

newsGridElement?.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.news-card')) {
        event.preventDefault();
        openNewsDetails(renderedNewsItems[Number(event.target.dataset.newsIndex)]);
    }
});

function openSpotlightNews(element) {
    const item = gameNewsItems.find(news => news.title === element?.dataset.newsTitle);
    openNewsDetails(item);
}

newsSpotlightElement?.addEventListener('click', event => {
    const card = event.target instanceof Element ? event.target.closest('.spotlight-card') : null;
    if (card) openSpotlightNews(card);
});

newsSpotlightElement?.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.spotlight-card')) {
        event.preventDefault();
        openSpotlightNews(event.target);
    }
});

document.getElementById('newsWishlistBtn')?.addEventListener('click', () => {
    if (!currentNewsItem) return;
    const key = slugifyNewsTitle(currentNewsItem.title);
    const wishlist = readNewsWishlist();
    const added = !wishlist.has(key);
    if (added) wishlist.add(key); else wishlist.delete(key);
    writeNewsWishlist(wishlist);
    updateNewsWishlistButton();
    updateWishlistControls();
    if (wishlistViewOpen) renderWishlistView();
    triggerLiveToastNotification(added ? 'Added to wishlist' : 'Removed from wishlist', currentNewsItem.title);
});

document.getElementById('closeNewsDialog')?.addEventListener('click', () => closeNewsDetails());
newsDialog?.addEventListener('click', event => {
    if (event.target === newsDialog) closeNewsDetails();
});
newsDialog?.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...newsDialog.querySelectorAll('button:not([hidden]):not(:disabled)')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});


initializeLocalAccounts();

// =========================================================================
// INTERACTION EFFECTS: cursor glow, card tilt + spotlight, magnetic buttons,
// click ripple and click sparks. Motion is skipped for people who prefer
// reduced motion, and mouse-only effects are skipped on touch screens.
// =========================================================================
(function setupInteractionEffects() {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const CARD_SELECTOR = '.game-card, .news-card, .spotlight-card, .hub-promo-card, .platform-guide-card, .shop-info-card, .membership-plan-card, .membership-info-card, .transaction-history-card';
    // How far (in degrees) each kind of card may lean toward the mouse
    const TILT_LIMITS = [['.game-card', 6], ['.news-card', 4], ['.spotlight-card', 3], ['.hub-promo-card', 3.5], ['.platform-guide-card', 2.5], ['.shop-info-card', 4], ['.membership-plan-card', 3]];
    const MAGNETIC_SELECTOR = '.btn-hero-action, .btn-hero-secondary, .floating-buy-btn, .cart-btn-container';
    const RIPPLE_SELECTOR = '.btn-buy, .btn-submit, .btn-secondary, .btn-hero-action, .btn-hero-secondary, .btn-auth-action, .platform-guide-link, .delivery-chip';
    const SPARK_SELECTOR = '.btn-buy, #confirmQuantityBtn, #finalPlaceOrderBtn';

    let activeCard = null;
    let activeMagnet = null;
    let pointerFrame = 0;
    let lastPointerEvent = null;

    const motionAllowed = () => !reducedMotion.matches;
    const mouseEffectsAllowed = event => motionAllowed() && canHover.matches && event.pointerType !== 'touch';
    const closestMatch = (event, selector) => (event.target instanceof Element ? event.target.closest(selector) : null);

    function tiltLimitFor(card) {
        for (const [selector, degrees] of TILT_LIMITS) {
            if (card.matches(selector)) return degrees;
        }
        return 0;
    }

    function ensureGlow(card) {
        if (card.querySelector(':scope > .fx-glow')) return;
        const glow = document.createElement('span');
        glow.className = 'fx-glow';
        glow.setAttribute('aria-hidden', 'true');
        card.appendChild(glow);
    }

    function resetCard(card) {
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
    }

    function resetMagnet(button) {
        button.style.removeProperty('--bx');
        button.style.removeProperty('--by');
    }

    // Backdrop logos and color glows shift a little with the mouse (-1..1 from screen center)
    const ambientBackdrop = document.querySelector('.blurred-bg');

    function applyPointerEffects(event) {
        if (ambientBackdrop) {
            ambientBackdrop.style.setProperty('--px', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
            ambientBackdrop.style.setProperty('--py', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
        }
        const card = closestMatch(event, CARD_SELECTOR);
        if (activeCard && activeCard !== card) resetCard(activeCard);
        activeCard = card;
        if (card) {
            ensureGlow(card);
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            card.style.setProperty('--mx', `${x.toFixed(0)}px`);
            card.style.setProperty('--my', `${y.toFixed(0)}px`);
            const limit = tiltLimitFor(card);
            if (limit) {
                card.style.setProperty('--rx', `${((0.5 - y / rect.height) * 2 * limit).toFixed(2)}deg`);
                card.style.setProperty('--ry', `${((x / rect.width - 0.5) * 2 * limit).toFixed(2)}deg`);
            }
        }

        const magnet = closestMatch(event, MAGNETIC_SELECTOR);
        if (activeMagnet && activeMagnet !== magnet) resetMagnet(activeMagnet);
        activeMagnet = magnet;
        if (magnet) {
            const rect = magnet.getBoundingClientRect();
            const offsetX = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
            const offsetY = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
            magnet.style.setProperty('--bx', `${(Math.max(-1, Math.min(1, offsetX)) * 5).toFixed(1)}px`);
            magnet.style.setProperty('--by', `${(Math.max(-1, Math.min(1, offsetY)) * 4).toFixed(1)}px`);
        }
    }

    document.addEventListener('pointermove', event => {
        if (!mouseEffectsAllowed(event)) return;
        lastPointerEvent = event;
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
            pointerFrame = 0;
            applyPointerEffects(lastPointerEvent);
        });
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => {
        if (activeCard) resetCard(activeCard);
        if (activeMagnet) resetMagnet(activeMagnet);
        activeCard = null;
        activeMagnet = null;
        cursorGlow.classList.remove('visible');
    });

    // ----- Soft light that follows the mouse -----
    const cursorGlow = document.createElement('div');
    cursorGlow.id = 'cursorGlow';
    cursorGlow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorGlow);

    let glowX = 0;
    let glowY = 0;
    let targetX = 0;
    let targetY = 0;
    let glowRunning = false;
    let glowPlaced = false;

    function animateGlow() {
        glowX += (targetX - glowX) * 0.14;
        glowY += (targetY - glowY) * 0.14;
        cursorGlow.style.transform = `translate3d(${glowX.toFixed(1)}px, ${glowY.toFixed(1)}px, 0)`;
        if (Math.abs(targetX - glowX) > 0.5 || Math.abs(targetY - glowY) > 0.5) {
            requestAnimationFrame(animateGlow);
        } else {
            glowRunning = false;
        }
    }

    document.addEventListener('pointermove', event => {
        if (!mouseEffectsAllowed(event)) return;
        targetX = event.clientX;
        targetY = event.clientY;
        if (!glowPlaced) {
            glowX = targetX;
            glowY = targetY;
            glowPlaced = true;
        }
        cursorGlow.classList.add('visible');
        if (!glowRunning) {
            glowRunning = true;
            requestAnimationFrame(animateGlow);
        }
    }, { passive: true });

    // ----- Ripple when a button is pressed -----
    document.addEventListener('pointerdown', event => {
        if (!motionAllowed() || event.button > 0) return;
        const button = closestMatch(event, RIPPLE_SELECTOR);
        if (!button || button.disabled) return;
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const ripple = document.createElement('span');
        ripple.className = 'fx-ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        button.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });

    // ----- Little sparks when something is added or ordered -----
    function spawnSparks(x, y) {
        const styles = getComputedStyle(document.body);
        const colors = [
            styles.getPropertyValue('--platform-bright').trim() || '#ff5260',
            styles.getPropertyValue('--platform-primary').trim() || '#FF1A2B',
            '#ffffff'
        ];
        const count = 12;
        for (let index = 0; index < count; index++) {
            const spark = document.createElement('span');
            const size = 4 + Math.random() * 5;
            spark.className = 'fx-particle';
            spark.style.cssText = `left:${x}px; top:${y}px; width:${size}px; height:${size}px; background:${colors[index % colors.length]};`;
            document.body.appendChild(spark);
            const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
            const distance = 36 + Math.random() * 46;
            const animation = spark.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0.2)`, opacity: 0 }
            ], { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
            animation.onfinish = () => spark.remove();
        }
    }

    document.addEventListener('click', event => {
        if (!motionAllowed()) return;
        const trigger = closestMatch(event, SPARK_SELECTOR);
        if (!trigger || trigger.disabled) return;
        const rect = trigger.getBoundingClientRect();
        // Keyboard clicks have no pointer position, so spark from the button's center
        const x = event.clientX || rect.left + rect.width / 2;
        const y = event.clientY || rect.top + rect.height / 2;
        spawnSparks(x, y);
    });
})();
