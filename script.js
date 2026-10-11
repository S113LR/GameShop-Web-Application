// =========================================================================
// 🏠 HOME DASHBOARD NAVIGATION PORT CONTROL ROUTERS
// =========================================================================

function showHomeDashboard() {
    document.body.classList.add('dashboard-home');
    document.getElementById('shop-screen')?.classList.add('dashboard-home');
    document.getElementById('home-dashboard-view')?.classList.remove('hidden');
    document.getElementById('gamesContainer')?.classList.add('hidden');
    document.getElementById('homeNavButton')?.setAttribute('aria-current', 'page');
    document.getElementById('homeNavButton')?.classList.add('active');
    activeGenre = 'All';
    document.querySelectorAll('.genre-btn[data-genre]').forEach(button => {
        button.classList.toggle('active', button.dataset.genre === activeGenre);
    });
    renderHomeHighlightsDeck();
    document.getElementById('home-dashboard-view')?.scrollTo({ top: 0 });
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
    document.querySelectorAll('.genre-btn[data-genre]').forEach(button => {
        button.classList.toggle('active', button.dataset.genre === activeGenre);
    });
    displayGames(currentCatalog);
}

function navigateToPlatformCatalog(platform) {
    activeGenre = 'All';
    switchPlatformEcosystem(platform);
    hideHomeDashboard();
}

function renderHomeHighlightsDeck() {
    const deckContainer = document.getElementById('featuredHighlightsDeck');
    if (!deckContainer) return;
    const highlightItems = getAllPlatformGames();
    const gameCount = document.getElementById('dashboardGameCount');
    if (gameCount) gameCount.textContent = `${highlightItems.length} games`;
    const featuredGame = highlightItems.find(game => game.platform === currentPlatform) || highlightItems[0];
    const featuredTitle = document.getElementById('featuredGameTitle');
    const featuredPlatform = document.getElementById('featuredGamePlatform');
    const featuredDescription = document.getElementById('featuredGameDescription');
    const featuredImage = document.getElementById('featuredGameImage');
    const detailsButton = document.getElementById('featuredGameDetailsButton');
    if (featuredGame && featuredTitle && featuredPlatform && featuredDescription && featuredImage && detailsButton) {
        const platform = featuredGame.platform || currentPlatform;
        const platformName = platformBranding[platform]?.name || platform;
        featuredTitle.textContent = featuredGame.title;
        featuredPlatform.textContent = `${platformName} · ${featuredGame.genre}`;
        featuredDescription.textContent = featuredGame.details?.synopsis
            || `Discover ${featuredGame.title} and more games in the ${platformName} collection.`;
        featuredImage.src = getGameImagePath(featuredGame.artworkPlatform || platform, featuredGame.image);
        featuredImage.alt = `${featuredGame.title} cover art`;
        detailsButton.onclick = () => {
            openHomeGameDetails(featuredGame);
        };
    }
    deckContainer.innerHTML = '';
    
    highlightItems.forEach((game, index) => {
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

function openHomeGameDetails(game) {
    if (!game) return;
    const card = document.createElement('div');
    card.dataset.gameId = String(game.id);
    card.dataset.platform = game.platform;
    openGameDetails(card);
}

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
    document.querySelectorAll('[data-usd-price]').forEach(priceElement => {
        const game = currentCatalog.find(item => String(item.id) === priceElement.dataset.gameId);
        if (game) {
            priceElement.textContent = formatCurrency(game.price);
        }
    });
    document.querySelectorAll('[data-membership-price]').forEach(priceElement => {
        priceElement.textContent = formatCurrency(Number(priceElement.dataset.membershipPrice));
    });
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
        card.dataset.gameId = cardId;
        card.tabIndex = 0;
        card.setAttribute('aria-haspopup', 'dialog');
        card.setAttribute('aria-label', `View details for ${game.title}`);
        card.style.setProperty('--reveal-delay', `${Math.min(index * 25, 300)}ms`);
        card.innerHTML = `
            <div class="box-art-wrapper" style="background: linear-gradient(135deg, ${game.color} 0%, #111 100%)">
                <img class="box-art-img" src="${getGameImagePath(game.artworkPlatform || gamePlatform, game.image)}" alt="${game.title} cover art" tabindex="-1" loading="lazy">
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

function setAuthMessage(message, isError = false) {
    const messageElement = document.getElementById('authMessage');
    messageElement.textContent = message;
    messageElement.classList.toggle('error', isError);
}

function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === 'signup';
    const signupFields = document.getElementById('signupFields');
    signupFields.classList.toggle('hidden', !isSignup);
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
}

document.getElementById('tab-login-btn').addEventListener('click', () => setAuthMode('signin'));
document.getElementById('tab-register-btn').addEventListener('click', () => setAuthMode('signup'));

document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = document.getElementById('authSubmitButton');
    submitButton.disabled = true;
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
        enterLocalAccount(email);
        setAuthMessage('');
    } catch (error) {
        console.error('Unable to open local account:', error);
        setAuthMessage(error.message || 'Unable to open this local account.', true);
    } finally {
        submitButton.disabled = false;
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
    shoppingCart = Array.isArray(account.cart) ? account.cart : [];
    selectedDeliveryModes.clear();
    Object.entries(account.deliveryModes || {}).forEach(([key, value]) => {
        if (value === 'physical' || value === 'digital') selectedDeliveryModes.set(key, value);
    });
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
                        <span>${escapeHtml(item.title)} · ${escapeHtml(item.platform)} · ${escapeHtml(item.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code')}</span>
                        <strong>${escapeHtml(formatCurrency(Number(item.price)))}</strong>
                    </li>
                `).join('')}
            </ul>
            <div class="transaction-history-footer">
                <span>Payment not processed · Order simulation</span>
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
    setAuthMode('signin');
});
document.getElementById('closeAccountDialog').addEventListener('click', () => {
    document.getElementById('accountDialog').classList.add('hidden');
    document.getElementById('profileMenuToggle').focus();
});
document.getElementById('accountDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) {
        document.getElementById('accountDialog').classList.add('hidden');
        document.getElementById('profileMenuToggle').focus();
    }
});
document.querySelector('[data-open-currency-settings]').addEventListener('click', () => {
    document.getElementById('accountDialog').classList.add('hidden');
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
    setAuthMode('signin');
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

function addItemToCart(gameId) {
    const normalizedId = String(gameId);
    const targetingGame = currentCatalog.find(g => String(g.id) === normalizedId)
        || getAllPlatformGames().find(g => String(g.id) === normalizedId || Number(g.id) === Number(gameId));

    if (targetingGame) {
        const platform = targetingGame.platform || currentPlatform;
        shoppingCart.push({
            ...targetingGame,
            deliveryMode: selectedDeliveryModes.get(`${platform}:${normalizedId}`) || 'digital'
        });
        updateCartBadgeCount();
        try {
            persistActiveLocalAccount();
        } catch (error) {
            triggerLiveToastNotification('Cart not saved', error.message);
        }
        const itemCount = shoppingCart.length;
        triggerLiveToastNotification(
            'Added to cart',
            `Your cart now has ${itemCount} item${itemCount === 1 ? '' : 's'}.`
        );
        const badge = document.getElementById('cartBtn');
        badge.style.transform = 'scale(1.15)';
        setTimeout(() => { badge.style.transform = 'scale(1)'; }, 150);
    }
}

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

function updateCartBadgeCount() {
    const totalItems = shoppingCart.length;
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
    return shoppingCart.reduce((totalPrice, game) => totalPrice + game.price, 0);
}

function renderCartListRows() {
    const listContainer = document.getElementById('cartItemsList');
    listContainer.innerHTML = '';
    
    if(shoppingCart.length === 0) {
        listContainer.innerHTML = `<p style="color:#8f8f8f; text-align:center; padding: 20px 0;">Your cart is completely empty.</p>`;
        document.getElementById('proceedToPayBtn').disabled = true;
    } else {
        document.getElementById('proceedToPayBtn').disabled = false;
        shoppingCart.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'cart-row';
            row.innerHTML = `
                <div>
                    <span class="cart-row-title">${item.title}</span>
                    <span class="cart-row-delivery">${item.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code'}</span>
                    <button class="remove-item-btn" onclick="removeItemFromCart(${index})">Remove</button>
                </div>
                <span class="cart-row-price">${formatCurrency(item.price)}</span>
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
// RESTORED PROCESSING TIMEOUT SEQUENCE INTERACTION HANDLER
function runLoadingSequence(onComplete, duration = 400) {
    const loadingScreen = document.getElementById('loadingOverlay');
    const loadingFill = document.getElementById('loadingBarFill');
    document.getElementById('loadingPlatformLogo').src = platformBranding[currentPlatform]?.logo || platformBranding.switch.logo;

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

document.getElementById('finalPlaceOrderBtn').addEventListener('click', () => {
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

    runLoadingSequence(async () => {
        try {
            await triggerReceiptGeneration(selectedMode);
            document.getElementById('cart-modal').classList.remove('hidden');
            document.getElementById('checkout-stage-items').classList.add('hidden');
            document.getElementById('checkout-stage-payment').classList.add('hidden');
            document.getElementById('checkout-stage-success').classList.remove('hidden');
        } catch (error) {
            document.getElementById('cart-modal').classList.remove('hidden');
            document.getElementById('checkout-stage-payment').classList.remove('hidden');
            const checkoutError = document.getElementById('checkoutError');
            checkoutError.textContent = error.message || 'Unable to save the order.';
            checkoutError.classList.remove('hidden');
        } finally {
            button.disabled = false;
        }
    }, 500);
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
    const orderItems = shoppingCart.map(game => ({
        id: String(game.id),
        title: game.title,
        platform: game.platform || currentPlatform,
        price: Number(game.price),
        deliveryMode: game.deliveryMode || 'digital'
    }));
    const total = calculateCartTotal();
    const hasPhysicalItems = orderItems.some(item => item.deliveryMode === 'physical');
    const deliveryEstimate = hasPhysicalItems
        ? `Simulated delivery estimate: ${formatDate(addBusinessDays(new Date(createdAt), 5))}. No package will be shipped.`
        : 'Digital delivery simulation only. No redeemable game codes will be issued.';
    const transaction = {
        id: transactionToken,
        transaction_number: transactionToken,
        status: 'order_placed_simulation',
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
        receipt_email_sent: false,
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
        receiptEmailSent: false,
        receiptEmailError: 'No email was sent; this order is stored in this browser only.',
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
        'Your order and estimated delivery were saved in this browser. No payment was processed or package shipped.'
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

    const { transactionToken, status, deliveryEstimate, receiptEmailSent, receiptEmailError, paymentMethod, address, email, items, total } = lastCompletedOrder;
    let htmlContent = `
        <div class="receipt-header-title">Order Confirmation · Simulation</div>
        <div class="receipt-meta-row"><span>Reference:</span><span class="receipt-meta-value">${escapeHtml(transactionToken)}</span></div>
        <div class="receipt-meta-row"><span>Status:</span><span class="receipt-meta-value">${escapeHtml(status.replaceAll('_', ' '))}</span></div>
        <div class="receipt-meta-row"><span>Payment Method:</span><span class="receipt-meta-value">${paymentMethod.toUpperCase()}</span></div>
        <div class="receipt-meta-row"><span>Currency:</span><span class="receipt-meta-value">${selectedCurrency}</span></div>
        <div class="receipt-meta-row"><span>Ship To:</span><span class="receipt-meta-value">${escapeHtml(address)}</span></div>
        <div class="receipt-meta-row"><span>Contact Account:</span><span class="receipt-meta-value">${escapeHtml(email)}</span></div>
        <div class="receipt-meta-row"><span>Receipt email:</span><span class="receipt-meta-value">${receiptEmailSent ? 'Sent' : 'Not sent'}</span></div>
        ${receiptEmailError ? `<p class="game-details-notes">${escapeHtml(receiptEmailError)}</p>` : ''}
        <p class="checkout-demo-notice">${escapeHtml(deliveryEstimate)} No payment is processed, game key is issued, or physical shipment scheduled.</p>
        
        <div class="receipt-divider"></div>
    `;
    
    items.forEach(game => {
        htmlContent += `
            <div class="receipt-item-line">
                <span>
                    <span class="receipt-item-name">${escapeHtml(game.title)}</span>
                    <small class="receipt-item-delivery">${game.deliveryMode === 'physical' ? 'Disc/Card' : 'Promo Code'}</small>
                </span>
                <span class="receipt-item-price">${formatCurrency(game.price)}</span>
            </div>
        `;
    });
    
    htmlContent += `
        <div class="receipt-divider"></div>
        <div class="receipt-total-line">
            <span>Total (not charged):</span>
            <span>${formatCurrency(total)}</span>
        </div>
    `;
    
    if (paymentMethod === '711') {
        htmlContent += `
            <div class="receipt-barcode-banner">
                |||| | |||| ||| || |<br>
                Sample voucher placeholder; not payable
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
            <button type="button" class="btn-buy game-details-buy" data-game-id="${escapeHtml(gameId)}">Add to Cart</button>
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
    gameDetailsDialog.classList.add('hidden');
    if (lastFocusedGameCard?.isConnected) {
        lastFocusedGameCard.focus();
    }
}

document.getElementById('gamesContainer').addEventListener('click', event => {
    if (event.target.closest('.btn-buy, .delivery-chip')) return;
    const gameCard = event.target.closest('.game-card');
    if (gameCard) openGameDetails(gameCard);
});

document.getElementById('gamesContainer').addEventListener('keydown', event => {
    if (event.target.closest('.btn-buy, .delivery-chip')) return;
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
        if (!imageLightbox.classList.contains('hidden')) {
            closeImageLightbox();
        } else if (!gameDetailsDialog.classList.contains('hidden')) {
            closeGameDetails();
    } else if (!document.getElementById('accountDialog').classList.contains('hidden')) {
        document.getElementById('accountDialog').classList.add('hidden');
        document.getElementById('profileMenuToggle').focus();
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

// ECOSYSTEM MENU SWITCH ROUTING CONTROLLER
function switchPlatformEcosystem(platform) {
    if (!['switch', 'psp', 'xbox'].includes(platform)) {
        throw new Error(`Unsupported store hub: ${platform}`);
    }

    currentPlatform = platform;
    
    document.body.classList.remove('platform-switch', 'platform-psp', 'platform-xbox');
    document.body.classList.add(`platform-${platform}`);
    
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
    document.querySelector('.brand-platform').textContent = {
        switch: 'for Nintendo Switch',
        psp: 'for PlayStation',
        xbox: 'for Microsoft Xbox'
    }[platform];

    if (activeGenre === 'membership') {
        displayMemberships();
    } else if (activeGenre === 'All') {
        displayGames(currentCatalog);
    } else {
        displayGames(currentCatalog.filter(game => game.genre === activeGenre));
    }
    
    const platformName = { switch: 'Nintendo Switch', psp: 'PlayStation', xbox: 'Xbox' }[platform];
    triggerLiveToastNotification("Ecosystem Shift", `Successfully moved to the ${platformName} game catalog.`);
}

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
        ? "Disc/Card selected. No physical shipment is scheduled."
        : "Promo Code selected. No redeemable code is issued.";
    triggerLiveToastNotification("Distribution Variant Set", message);
}

// LIVE IN-APP TOAST ALERT PAYLOAD POPUPS DISPATCHER
function triggerLiveToastNotification(title, message) {
    const containerTray = document.getElementById('notificationCenterTray');
    if (!containerTray) return;
    
    const toastCard = document.createElement('div');
    toastCard.className = 'toast-notif-card';
    toastCard.innerHTML = `<h5>${title}</h5><p>${message}</p>`;
    
    containerTray.appendChild(toastCard);
    setTimeout(() => toastCard.classList.add('active'), 40);
    
    // Automatically fade out notification container elements safely after 5 seconds
    setTimeout(() => {
        toastCard.classList.remove('active');
        setTimeout(() => toastCard.remove(), 400);
    }, 5000);
}
initializeLocalAccounts();
