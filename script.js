// ==========================================
// $DERANGED - The Deranged Penguin
// Main JavaScript
// ==========================================

// Contract Configuration - DEPLOYED ON BASE MAINNET
const CONTRACT_CONFIG = {
    address: "0x56649E9e7aD83bF37a74b8160A699D7A270AE3A9",
    chainId: 8453, // Base Mainnet
    rpcUrl: "https://mainnet.base.org",
    basescanApi: "https://api.basescan.org/api",
    basescanApiKey: "", // Optional: get from basescan.org for higher rate limits
    // Dead address for burn tracking
    deadAddress: "0x000000000000000000000000000000000000dEaD",
    // Contract ABI (minimal for reading data)
    abi: [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function totalBurned() view returns (uint256)",
        "function totalDonatedToCharity() view returns (uint256)",
        "function charityWallet() view returns (address)",
        "function tradingEnabled() view returns (bool)",
        "function buyBurnTax() view returns (uint256)",
        "function sellBurnTax() view returns (uint256)",
        "function charityTax() view returns (uint256)"
    ]
};

// Cache for data to avoid too many requests
let dataCache = {
    holders: 0,
    totalBurned: 0,
    totalDonated: 0,
    charityWallet: null,
    lastUpdate: 0,
    tokenPrice: 0 // USD price per token
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('🐧 DOM loaded, initializing...');
    initParticles();
    initSnowEffect();
    initNavbar();
    initMobileMenu();
    initSmoothScroll();
    initCounters();
    initFAQ();
    initScrollAnimations();
    initContractData(); // Load contract data
    initLiveStats(); // Initialize live stats updates
});

// ==========================================
// LIVE STATS SYSTEM
// ==========================================
function initLiveStats() {
    // Update stats immediately
    updateAllStats();
    
    // Update every 30 seconds
    setInterval(updateAllStats, 30000);
    
    // Add "live" indicator pulse
    addLiveIndicators();
}

function addLiveIndicators() {
    // Add pulsing dot to indicate live data
    const statElements = document.querySelectorAll('#holdersCount, #totalDonated, #penguinsHelped, #totalBurned');
    statElements.forEach(el => {
        if (!el.querySelector('.live-dot')) {
            const dot = document.createElement('span');
            dot.className = 'live-dot';
            dot.innerHTML = ' <span style="display:inline-block;width:8px;height:8px;background:#00ff88;border-radius:50%;animation:pulse 2s infinite;"></span>';
            el.appendChild(dot);
        }
    });
}

async function updateAllStats() {
    console.log('📊 Updating all live stats...');
    
    try {
        // Fetch blockchain data
        await fetchContractData();
        
        // Update last refresh timestamp
        updateLastRefreshTime();
    } catch (error) {
        console.error('❌ Error updating stats:', error);
    }
}

// ==========================================
// CONTRACT DATA FETCHING
// ==========================================
async function initContractData() {
    console.log('📊 Initializing contract data...');
    
    if (!CONTRACT_CONFIG.address) {
        console.log('⏳ Contract not deployed yet');
        return;
    }
    
    // Load data immediately
    await fetchContractData();
}

function updateLastRefreshTime() {
    const timeEl = document.getElementById('lastUpdate');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = `Last updated: ${now.toLocaleTimeString()}`;
    }
}

async function fetchContractData() {
    try {
        // Use ethers from CDN if available, otherwise use fetch directly
        if (typeof ethers !== 'undefined') {
            await fetchWithEthers();
        } else {
            await fetchWithBasescan();
        }
    } catch (error) {
        console.error('❌ Error fetching contract data:', error);
    }
}

// Fetch using ethers.js (if loaded)
async function fetchWithEthers() {
    const provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
    const contract = new ethers.Contract(
        CONTRACT_CONFIG.address,
        CONTRACT_CONFIG.abi,
        provider
    );
    
    try {
        // Fetch all data in parallel
        const [
            totalBurned,
            totalDonated,
            charityWallet,
            totalSupply,
            tradingEnabled
        ] = await Promise.all([
            contract.totalBurned(),
            contract.totalDonatedToCharity(),
            contract.charityWallet(),
            contract.totalSupply(),
            contract.tradingEnabled().catch(() => false)
        ]);
        
        // Get holder count from BaseScan
        const holders = await fetchHolderCount();
        
        // Get token price (try DexScreener API)
        const tokenPrice = await fetchTokenPrice();
        
        // Calculate values
        const burnedFormatted = parseFloat(ethers.formatEther(totalBurned));
        const donatedFormatted = parseFloat(ethers.formatEther(totalDonated));
        const supplyFormatted = parseFloat(ethers.formatEther(totalSupply));
        
        // Cache the data
        dataCache = {
            holders: holders,
            totalBurned: burnedFormatted,
            totalDonated: donatedFormatted,
            charityWallet: charityWallet,
            totalSupply: supplyFormatted,
            tradingEnabled: tradingEnabled,
            tokenPrice: tokenPrice,
            lastUpdate: Date.now()
        };
        
        // Update UI
        updateContractUI(dataCache);
        
    } catch (error) {
        console.error('Error in fetchWithEthers:', error);
        // Try fallback method
        await fetchWithBasescan();
    }
}

// Fetch token price from DexScreener
async function fetchTokenPrice() {
    try {
        // DexScreener API for Base tokens
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CONTRACT_CONFIG.address}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
            // Get price from the first pair
            return parseFloat(data.pairs[0].priceUsd) || 0;
        }
    } catch (error) {
        console.log('Price not available yet (token may not be listed)');
    }
    return 0;
}

// Fetch using BaseScan API (fallback)
async function fetchWithBasescan() {
    const address = CONTRACT_CONFIG.address;
    const apiKey = CONTRACT_CONFIG.basescanApiKey;
    
    // Get token info
    const tokenInfoUrl = `${CONTRACT_CONFIG.basescanApi}?module=token&action=tokeninfo&contractaddress=${address}${apiKey ? '&apikey=' + apiKey : ''}`;
    
    // Get holder count
    const holders = await fetchHolderCount();
    
    // For now, show holder count at minimum
    updateContractUI({
        holders: holders,
        totalDonated: 0,
        totalBurned: 0
    });
}

// Fetch holder count from BaseScan
async function fetchHolderCount() {
    try {
        const address = CONTRACT_CONFIG.address;
        const apiKey = CONTRACT_CONFIG.basescanApiKey;
        
        // Method 1: Try token holder count from tokentx
        const txUrl = `${CONTRACT_CONFIG.basescanApi}?module=token&action=tokenholderlist&contractaddress=${address}&page=1&offset=10000${apiKey ? '&apikey=' + apiKey : ''}`;
        
        try {
            const response = await fetch(txUrl);
            const data = await response.json();
            
            if (data.status === '1' && data.result && Array.isArray(data.result)) {
                return data.result.length;
            }
        } catch (e) {
            console.log('Holder list method failed, trying alternative...');
        }
        
        // Method 2: Try token info endpoint
        const infoUrl = `${CONTRACT_CONFIG.basescanApi}?module=token&action=tokeninfo&contractaddress=${address}${apiKey ? '&apikey=' + apiKey : ''}`;
        const infoResponse = await fetch(infoUrl);
        const infoData = await infoResponse.json();
        
        if (infoData.result && infoData.result[0] && infoData.result[0].holdersCount) {
            return parseInt(infoData.result[0].holdersCount) || 1;
        }
        
        // If contract is deployed but no trades yet, at least deployer holds tokens
        return 1;
        
    } catch (error) {
        console.error('Error fetching holders:', error);
        return dataCache.holders || 1;
    }
}

// Update UI with contract data
function updateContractUI(data) {
    console.log('📊 Updating UI with contract data:', data);
    
    // Update holders count
    const holdersEl = document.getElementById('holdersCount');
    if (holdersEl && data.holders) {
        animateNumber(holdersEl, data.holders);
    }
    
    // Calculate USD value of donated tokens
    let donatedUSD = 0;
    if (data.totalDonated && data.tokenPrice) {
        donatedUSD = data.totalDonated * data.tokenPrice;
    }
    
    // Update total donated (in USD)
    const donatedEl = document.getElementById('totalDonated');
    if (donatedEl) {
        if (donatedUSD > 0) {
            donatedEl.textContent = `$${formatUSD(donatedUSD)}`;
        } else if (data.totalDonated > 0) {
            // Show in tokens if no price available
            donatedEl.textContent = `${formatNumber(data.totalDonated)} tokens`;
        } else {
            donatedEl.textContent = '$0';
        }
    }
    
    // Update penguins helped (estimated at $50 per penguin)
    const penguinsEl = document.getElementById('penguinsHelped');
    if (penguinsEl) {
        const penguinsHelped = donatedUSD > 0 ? Math.floor(donatedUSD / 50) : 0;
        animateNumber(penguinsEl, penguinsHelped);
    }
    
    // Update charity wallet address
    const walletEl = document.getElementById('charityWallet');
    if (walletEl && data.charityWallet) {
        walletEl.textContent = data.charityWallet;
    }
    
    // Update burned tokens
    const burnedEl = document.getElementById('totalBurned');
    if (burnedEl && data.totalBurned !== undefined) {
        burnedEl.textContent = formatNumber(data.totalBurned) + ' 🔥';
    }
    
    // Update circulating supply
    if (data.totalSupply && data.totalBurned !== undefined) {
        const circulating = data.totalSupply - data.totalBurned;
        const circulatingEl = document.getElementById('circulatingSupply');
        if (circulatingEl) {
            circulatingEl.textContent = formatNumber(circulating);
        }
        
        // Update burn percentage
        const burnPercentEl = document.getElementById('burnPercent');
        if (burnPercentEl && data.totalSupply > 0) {
            const burnPercent = (data.totalBurned / data.totalSupply * 100).toFixed(4);
            burnPercentEl.textContent = `${burnPercent}%`;
        }
    }
    
    // Update trading status indicator
    const tradingEl = document.getElementById('tradingStatus');
    if (tradingEl) {
        if (data.tradingEnabled) {
            tradingEl.innerHTML = '<span style="color:#00ff88">● LIVE</span>';
        } else {
            tradingEl.innerHTML = '<span style="color:#ff6b6b">○ Coming Soon</span>';
        }
    }
    
    // Update token price if available
    const priceEl = document.getElementById('tokenPrice');
    if (priceEl) {
        if (data.tokenPrice > 0) {
            priceEl.textContent = `$${data.tokenPrice.toFixed(8)}`;
        } else {
            priceEl.textContent = '--';
        }
    }
    
    // Update market cap if we have price
    const mcapEl = document.getElementById('marketCap');
    if (mcapEl && data.tokenPrice > 0 && data.totalSupply) {
        const mcap = (data.totalSupply - (data.totalBurned || 0)) * data.tokenPrice;
        mcapEl.textContent = `$${formatUSD(mcap)}`;
    }
    
    // =====================
    // UPDATE LIVE STATS SECTION (duplicate IDs with "live" prefix)
    // =====================
    
    // Live Holders
    const liveHoldersEl = document.getElementById('liveHolders');
    if (liveHoldersEl && data.holders) {
        animateNumber(liveHoldersEl, data.holders);
    }
    
    // Live Burned
    const liveBurnedEl = document.getElementById('liveBurned');
    if (liveBurnedEl && data.totalBurned !== undefined) {
        liveBurnedEl.textContent = formatNumber(data.totalBurned);
    }
    
    // Live Donated
    const liveDonatedEl = document.getElementById('liveDonated');
    if (liveDonatedEl) {
        if (donatedUSD > 0) {
            liveDonatedEl.textContent = `$${formatUSD(donatedUSD)}`;
        } else if (data.totalDonated > 0) {
            liveDonatedEl.textContent = `${formatNumber(data.totalDonated)} tokens`;
        } else {
            liveDonatedEl.textContent = '$0';
        }
    }
    
    // Live Penguins
    const livePenguinsEl = document.getElementById('livePenguins');
    if (livePenguinsEl) {
        const penguinsCount = donatedUSD > 0 ? Math.floor(donatedUSD / 50) : 0;
        animateNumber(livePenguinsEl, penguinsCount);
    }
}

// Format USD values
function formatUSD(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

// Animate number counting up
function animateNumber(element, target) {
    const current = parseInt(element.textContent.replace(/[^0-9]/g, '')) || 0;
    const increment = Math.ceil((target - current) / 20);
    let value = current;
    
    const timer = setInterval(() => {
        value += increment;
        if ((increment > 0 && value >= target) || (increment < 0 && value <= target)) {
            value = target;
            clearInterval(timer);
        }
        element.textContent = formatNumber(value);
    }, 50);
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toLocaleString();
}

// Copy charity wallet to clipboard
function copyCharityWallet() {
    const walletEl = document.getElementById('charityWallet');
    if (walletEl && walletEl.textContent && walletEl.textContent !== 'Will be displayed after launch') {
        navigator.clipboard.writeText(walletEl.textContent);
        
        // Show feedback
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }
}

// ==========================================
// PARTICLES SYSTEM (No external libraries)
// ==========================================
function initParticles() {
    console.log('🔵 Initializing particles...');
    
    const container = document.getElementById('particles-js');
    if (!container) {
        console.log('❌ No particles container found');
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null, radius: 150 };
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.x;
        mouse.y = e.y;
    });
    
    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });
    
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 4 + 2;
            this.speedX = Math.random() * 2 - 1;
            this.speedY = Math.random() * 2 - 1;
            this.density = Math.random() * 30 + 1;
        }
        
        update() {
            // Mouse repulsion
            if (mouse.x && mouse.y) {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < mouse.radius) {
                    let force = (mouse.radius - distance) / mouse.radius;
                    let dirX = dx / distance;
                    let dirY = dy / distance;
                    this.x -= dirX * force * this.density * 0.6;
                    this.y -= dirY * force * this.density * 0.6;
                }
            }
            
            // Movement
            this.x += this.speedX;
            this.y += this.speedY;
            
            // Boundaries - wrap around
            if (this.x < 0) this.x = canvas.width;
            if (this.x > canvas.width) this.x = 0;
            if (this.y < 0) this.y = canvas.height;
            if (this.y > canvas.height) this.y = 0;
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(78, 205, 196, 0.8)';
            ctx.fill();
        }
    }
    
    // Create 150 particles
    for (let i = 0; i < 150; i++) {
        particles.push(new Particle());
    }
    console.log('✅ Created', particles.length, 'particles');
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update and draw particles
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        
        // Draw connections between nearby particles
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                let dx = particles[i].x - particles[j].x;
                let dy = particles[i].y - particles[j].y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 120) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(78, 205, 196, ${0.3 - distance/400})`;
                    ctx.lineWidth = 1;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
    console.log('✅ Particles animation started!');
}

// ==========================================
// SNOW EFFECT
// ==========================================
const snowflakes = [];
let snowMouseX = window.innerWidth / 2;
let snowMouseY = window.innerHeight / 2;

document.addEventListener('mousemove', (e) => {
    snowMouseX = e.clientX;
    snowMouseY = e.clientY;
});

class Snowflake {
    constructor() {
        this.element = document.createElement('div');
        this.element.innerHTML = Math.random() > 0.5 ? '❄' : '❅';
        
        this.x = Math.random() * window.innerWidth;
        this.y = -30;
        this.size = Math.random() * 20 + 12;
        this.speedY = Math.random() * 2 + 1;
        this.speedX = 0;
        this.wobble = Math.random() * 2 - 1;
        this.wobbleSpeed = Math.random() * 0.02 + 0.01;
        this.rotation = 0;
        this.rotationSpeed = Math.random() * 3 - 1.5;
        this.opacity = Math.random() * 0.5 + 0.5;
        this.time = Math.random() * 100;
        
        this.element.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            font-size: ${this.size}px;
            opacity: ${this.opacity};
            pointer-events: none;
            z-index: 9999;
            color: #fff;
            text-shadow: 0 0 10px rgba(78, 205, 196, 0.8), 0 0 20px rgba(78, 205, 196, 0.4);
            will-change: transform;
        `;
        
        document.body.appendChild(this.element);
    }
    
    update() {
        this.time += 1;
        
        // Calculate distance from mouse
        const dx = this.x - snowMouseX;
        const dy = this.y - snowMouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Apply mouse influence if within radius (150px)
        if (distance < 150) {
            const force = (1 - distance / 150) * 1.5;
            const angle = Math.atan2(dy, dx);
            this.speedX += Math.cos(angle) * force;
            this.speedY += Math.sin(angle) * force * 0.3;
        }
        
        // Natural wobble
        this.speedX += Math.sin(this.time * this.wobbleSpeed) * 0.08;
        
        // Friction
        this.speedX *= 0.96;
        
        // Update position
        this.x += this.speedX + this.wobble * 0.2;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
        
        // Wrap horizontally
        if (this.x < -30) this.x = window.innerWidth + 30;
        if (this.x > window.innerWidth + 30) this.x = -30;
        
        // Update element
        this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
        
        // Return false if off screen (to remove)
        return this.y < window.innerHeight + 50;
    }
    
    remove() {
        if (this.element.parentNode) {
            this.element.remove();
        }
    }
}

function animateSnowflakes() {
    for (let i = snowflakes.length - 1; i >= 0; i--) {
        const alive = snowflakes[i].update();
        if (!alive) {
            snowflakes[i].remove();
            snowflakes.splice(i, 1);
        }
    }
    requestAnimationFrame(animateSnowflakes);
}

function createSnowflake() {
    if (snowflakes.length < 100) {
        snowflakes.push(new Snowflake());
    }
}

function initSnowEffect() {
    console.log('❄️ Starting snow effect...');
    
    // Start animation
    animateSnowflakes();
    
    // Create initial batch
    for (let i = 0; i < 20; i++) {
        setTimeout(() => createSnowflake(), i * 50);
    }
    
    // Keep creating
    setInterval(createSnowflake, 200);
    
    console.log('❄️ Snow effect initialized!');
}

// ==========================================
// NAVIGATION
// ==========================================
function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger.classList.remove('active');
            });
        });
    }
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ==========================================
// COUNTERS
// ==========================================
function initCounters() {
    const counters = document.querySelectorAll('.stat-value[data-target]');
    
    const animateCounter = (counter) => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000;
        const startTime = performance.now();
        
        const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(target * easeOutQuart);
            
            counter.textContent = formatNumber(current);
            
            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        };
        
        requestAnimationFrame(updateCounter);
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => observer.observe(counter));
}

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(0) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toLocaleString();
}

// ==========================================
// FAQ
// ==========================================
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(i => i.classList.remove('active'));
                if (!isActive) item.classList.add('active');
            });
        }
    });
}

// ==========================================
// SCROLL ANIMATIONS
// ==========================================
function initScrollAnimations() {
    const elements = document.querySelectorAll(
        '.story-chapter, .philosophy-card, .feature-card, .step-card, .social-card, .roadmap-phase'
    );
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(el);
    });
}

// ==========================================
// UTILITIES
// ==========================================
function copyContract() {
    const address = document.getElementById('contractAddress');
    if (!address) return;
    
    const text = address.textContent;
    if (text === '0x000...COMING SOON') {
        showToast('Contract address coming soon!', 'info');
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Contract address copied!', 'success');
    });
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const bgColor = type === 'success' ? '#4ECDC4' : type === 'error' ? '#FF6B6B' : '#45B7D1';
    
    toast.innerHTML = `<span>${message}</span>`;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: ${bgColor};
        color: #0a0a0f;
        padding: 16px 24px;
        border-radius: 50px;
        font-weight: 600;
        z-index: 10000;
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Wallet & Video placeholders
document.getElementById('connectWallet')?.addEventListener('click', function(e) {
    e.preventDefault();
    showToast('Wallet connection coming soon!', 'info');
});

document.querySelector('.video-placeholder')?.addEventListener('click', function() {
    window.open('https://www.youtube.com/watch?v=zWH_9VRWn8Y', '_blank');
});

// Easter Egg
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', function(e) {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);
    
    if (konamiCode.join(',') === konamiSequence.join(',')) {
        showToast('🐧 You found the deranged penguin! 🏔️', 'success');
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const penguin = document.createElement('div');
                penguin.innerHTML = '🐧';
                penguin.style.cssText = `
                    position: fixed;
                    top: -50px;
                    left: ${Math.random() * 100}vw;
                    font-size: 40px;
                    pointer-events: none;
                    z-index: 9999;
                    animation: penguinFall 3s linear forwards;
                `;
                document.body.appendChild(penguin);
                setTimeout(() => penguin.remove(), 3000);
            }, i * 100);
        }
    }
});

// Add animation keyframe
const style = document.createElement('style');
style.textContent = `
    @keyframes penguinFall {
        to { transform: translateY(100vh) rotate(360deg); }
    }
`;
document.head.appendChild(style);

// ==========================================
// VIDEO PLAYER (Autoplay with unmute option)
// ==========================================
function unmuteVideo() {
    const iframe = document.getElementById('youtubePlayer');
    const unmuteBtn = document.getElementById('unmuteBtn');
    
    if (!iframe) {
        console.error('Video iframe not found');
        return;
    }
    
    // YouTube video ID
    const videoId = 'zWH_9VRWn8Y';
    
    // Reload video without mute and with autoplay
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1`;
    
    // Hide unmute button
    if (unmuteBtn) {
        unmuteBtn.classList.add('hidden');
    }
    
    console.log('🔊 Video unmuted');
}

// Legacy function (kept for compatibility)
function loadVideo() {
    unmuteVideo();
}

console.log(`
🐧 $DERANGED - The Deranged Penguin 🐧
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Some walk to the sea.
 Some walk to the colony.
 We walk to the mountains."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
