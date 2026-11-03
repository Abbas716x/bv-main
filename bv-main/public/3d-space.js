/* ==================================================================
   X00716 NEXUS ENTERPRISE — 3D Moving Stars & Cosmic Space Engine
   ================================================================== */

(function () {
    'use strict';

    function initSpaceEngine() {
        const canvas = document.getElementById('space-bg') || document.getElementById('space-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let dpr = 1;

        // Stellar Density & Color Spectrum
        const IS_MOBILE = window.innerWidth < 768;
        const STAR_COUNT = IS_MOBILE ? 220 : 480;
        const DUST_COUNT = IS_MOBILE ? 24 : 50;
        const SPECTRUM = ['#FFFFFF', '#E0F7FA', '#00FFFF', '#C026D3', '#00FF88', '#FFD700'];

        let stars = [];
        let dustParticles = [];
        let meteors = [];
        let shockwaves = [];

        // Warp Speed Multiplier (Smooth transition on click/tap)
        let warpBoost = 1.0;
        let targetWarpBoost = 1.0;

        // Dynamic 3D Camera Angle & Parallax Tilt
        const mouse = { x: -9999, y: -9999, active: false, radius: 170 };
        const tilt = { targetX: 0, targetY: 0, currentX: 0, currentY: 0 };

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);

            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            initStars();
            initDust();
        }

        // 1. Initialize 3D Stars in a Volumetric Coordinate Space
        function initStars() {
            stars = [];
            for (let i = 0; i < STAR_COUNT; i++) {
                stars.push(createStar(Math.random() * 1500));
            }
        }

        function createStar(initialZ) {
            return {
                x: (Math.random() - 0.5) * width * 3.2,
                y: (Math.random() - 0.5) * height * 3.2,
                z: initialZ !== undefined ? initialZ : 1500,
                speed: Math.random() * 3.2 + 2.2, // Continuous forward 3D velocity
                baseSize: Math.random() * 1.5 + 0.8,
                color: SPECTRUM[Math.floor(Math.random() * SPECTRUM.length)],
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: Math.random() * 0.04 + 0.02
            };
        }

        // 2. Interactive Foreground Constellation Dust
        function initDust() {
            dustParticles = [];
            for (let i = 0; i < DUST_COUNT; i++) {
                const depth = Math.random() * 0.8 + 0.3;
                dustParticles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    z: depth,
                    vx: (Math.random() - 0.5) * 0.45 * depth,
                    vy: (Math.random() - 0.5) * 0.45 * depth,
                    radius: (Math.random() * 2 + 1.2) * depth,
                    color: SPECTRUM[Math.floor(Math.random() * SPECTRUM.length)],
                    pulse: Math.random() * Math.PI * 2,
                    pulseSpeed: Math.random() * 0.03 + 0.015
                });
            }
        }

        // 3. Fast Passing Shooting Stars / Meteors
        function spawnMeteor() {
            if (meteors.length >= 2) return;
            const startX = Math.random() * width * 1.2;
            const startY = -60;
            const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.25;
            const speed = Math.random() * 14 + 12;

            meteors.push({
                x: startX,
                y: startY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                length: Math.random() * 130 + 90,
                alpha: 1.0,
                color: Math.random() > 0.4 ? '#00FFFF' : '#C026D3'
            });
        }

        // 4. Kinetic Cosmic Shockwave
        function triggerShockwave(x, y) {
            targetWarpBoost = 3.2; // Temporary warp speed burst!
            setTimeout(() => { targetWarpBoost = 1.0; }, 650);

            shockwaves.push({
                x, y,
                radius: 10,
                maxRadius: IS_MOBILE ? 180 : 260,
                alpha: 0.95,
                speed: 9,
                color: SPECTRUM[Math.floor(Math.random() * SPECTRUM.length)]
            });

            dustParticles.forEach(p => {
                const dx = p.x - x;
                const dy = p.y - y;
                const dist = Math.hypot(dx, dy);
                if (dist < 260 && dist > 1) {
                    const force = ((260 - dist) / 260) * 11;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                }
            });
        }

        let lastTime = 0;
        let nextMeteorTime = Date.now() + Math.random() * 5000 + 3000;

        // 60 FPS 3D Render Pipeline
        function render(currentTime) {
            requestAnimationFrame(render);

            const delta = currentTime - lastTime;
            if (delta < 15) return; // Cap at ~60-66 FPS
            lastTime = currentTime;

            // Smooth Interpolation for 3D Camera Tilt & Warp Speed
            tilt.currentX += (tilt.targetX - tilt.currentX) * 0.06;
            tilt.currentY += (tilt.targetY - tilt.currentY) * 0.06;
            warpBoost += (targetWarpBoost - warpBoost) * 0.08;

            // Dark Deep Cosmic Background Base
            ctx.fillStyle = '#050714';
            ctx.fillRect(0, 0, width, height);

            // Subtle Deep Nebula Ambience
            const cx = width / 2 + tilt.currentX * 18;
            const cy = height / 2 + tilt.currentY * 18;

            const nebulaGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * 0.85);
            nebulaGrad.addColorStop(0, 'rgba(15, 20, 55, 0.45)');
            nebulaGrad.addColorStop(0.5, 'rgba(12, 10, 35, 0.25)');
            nebulaGrad.addColorStop(1, 'rgba(5, 7, 20, 0)');
            ctx.fillStyle = nebulaGrad;
            ctx.fillRect(0, 0, width, height);

            // ==================== A. 3D MOVING STARS IN PERSPECTIVE ====================
            const fov = 340;

            for (let i = 0; i < stars.length; i++) {
                const star = stars[i];

                // Previous position for 3D motion trail / streak
                const prevK = fov / Math.max(1, star.z);
                const prevPx = star.x * prevK + cx;
                const prevPy = star.y * prevK + cy;

                // Move star along the Z-axis towards the viewer
                star.z -= star.speed * warpBoost;

                // Recycle star when it passes the camera
                if (star.z <= 1) {
                    stars[i] = createStar(1500);
                    continue;
                }

                // Current projected 3D coordinates
                const k = fov / star.z;
                const px = star.x * k + cx;
                const py = star.y * k + cy;

                // Check viewport bounds
                if (px < -60 || px > width + 60 || py < -60 || py > height + 60) {
                    stars[i] = createStar(1500);
                    continue;
                }

                // Smooth Depth Proximity Shading
                star.twinkle += star.twinkleSpeed;
                const depthRatio = Math.max(0, 1 - star.z / 1500);
                const brightness = Math.min(1.0, depthRatio * 1.5) * (0.8 + Math.sin(star.twinkle) * 0.2);
                const headRadius = Math.max(0.75, star.baseSize * k * 0.85);

                // 3D Motion Streak (Trail)
                ctx.strokeStyle = star.color;
                ctx.lineWidth = Math.max(0.6, headRadius * 0.8);
                ctx.globalAlpha = Math.min(1.0, brightness * 0.85);
                ctx.beginPath();
                ctx.moveTo(prevPx, prevPy);
                ctx.lineTo(px, py);
                ctx.stroke();

                // Luminous Star Core Head
                ctx.fillStyle = star.color;
                ctx.globalAlpha = brightness;
                ctx.beginPath();
                ctx.arc(px, py, headRadius, 0, Math.PI * 2);
                ctx.fill();

                // Near-field Specular Glow on fast stars
                if (depthRatio > 0.65) {
                    ctx.fillStyle = star.color;
                    ctx.globalAlpha = (depthRatio - 0.65) * 0.4;
                    ctx.beginPath();
                    ctx.arc(px, py, headRadius * 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.globalAlpha = 1.0;

            // ==================== B. COMETS & SHOOTING STARS ====================
            if (Date.now() > nextMeteorTime) {
                spawnMeteor();
                nextMeteorTime = Date.now() + Math.random() * 6000 + 4000;
            }

            for (let i = meteors.length - 1; i >= 0; i--) {
                const m = meteors[i];
                m.x += m.vx;
                m.y += m.vy;
                m.alpha -= 0.016;

                if (m.alpha <= 0 || m.x > width + 150 || m.y > height + 150) {
                    meteors.splice(i, 1);
                    continue;
                }

                const tailX = m.x - m.vx * (m.length / 16);
                const tailY = m.y - m.vy * (m.length / 16);

                const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
                grad.addColorStop(0, m.color);
                grad.addColorStop(0.3, '#FFFFFF');
                grad.addColorStop(1, 'transparent');

                ctx.save();
                ctx.globalAlpha = m.alpha;
                ctx.strokeStyle = grad;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.moveTo(m.x, m.y);
                ctx.lineTo(tailX, tailY);
                ctx.stroke();

                // Comet Head Glow
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // ==================== C. CONSTELLATION INTERLINKAGE ====================
            const connectionLimit = IS_MOBILE ? 90 : 130;
            for (let i = 0; i < dustParticles.length; i++) {
                const p1 = dustParticles[i];
                for (let j = i + 1; j < dustParticles.length; j++) {
                    const p2 = dustParticles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < connectionLimit) {
                        const alpha = (1 - dist / connectionLimit) * 0.22 * Math.min(p1.z, p2.z);
                        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
                        ctx.lineWidth = 0.7 * Math.min(p1.z, p2.z);
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            }

            // ==================== D. NEON PARTICLES & CURSOR DYNAMICS ====================
            dustParticles.forEach(p => {
                p.pulse += p.pulseSpeed;

                if (mouse.active) {
                    const mdx = p.x - mouse.x;
                    const mdy = p.y - mouse.y;
                    const mdist = Math.hypot(mdx, mdy);
                    if (mdist < mouse.radius && mdist > 0.1) {
                        const mforce = (mouse.radius - mdist) / mouse.radius;
                        p.vx += (mdx / mdist) * mforce * 0.7 * p.z;
                        p.vy += (mdy / mdist) * mforce * 0.7 * p.z;
                    }
                }

                p.x += p.vx + tilt.currentX * p.z * 0.4;
                p.y += p.vy + tilt.currentY * p.z * 0.4;
                p.vx *= 0.982;
                p.vy *= 0.982;

                if (Math.abs(p.vx) < 0.08) p.vx += (Math.random() - 0.5) * 0.04;
                if (Math.abs(p.vy) < 0.08) p.vy += (Math.random() - 0.5) * 0.04;

                if (p.x < 0) { p.x = 0; p.vx *= -1; }
                if (p.x > width) { p.x = width; p.vx *= -1; }
                if (p.y < 0) { p.y = 0; p.vy *= -1; }
                if (p.y > height) { p.y = height; p.vy *= -1; }

                const currentRadius = p.radius * (1 + Math.sin(p.pulse) * 0.22);

                ctx.beginPath();
                ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = 0.85;
                ctx.fill();
            });

            // ==================== E. IMPULSE SHOCKWAVES ====================
            for (let i = shockwaves.length - 1; i >= 0; i--) {
                const sw = shockwaves[i];
                sw.radius += sw.speed;
                sw.alpha -= 0.024;

                if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
                    shockwaves.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
                ctx.strokeStyle = sw.color;
                ctx.globalAlpha = sw.alpha;
                ctx.lineWidth = 2.4;
                ctx.stroke();
                ctx.restore();
            }

            ctx.globalAlpha = 1.0;
        }

        // ==================== INTERACTION LISTENERS ====================
        window.addEventListener('resize', resize, { passive: true });

        window.addEventListener('mousemove', e => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;

            tilt.targetX = (e.clientX / width - 0.5) * 5;
            tilt.targetY = (e.clientY / height - 0.5) * 5;

            const orbs = document.querySelectorAll('.orb');
            orbs.forEach((orb, idx) => {
                const factor = (idx % 2 === 0 ? -1 : 1) * (12 + idx * 4);
                orb.style.transform = `translate(${tilt.targetX * factor}px, ${tilt.targetY * factor}px)`;
            });
        }, { passive: true });

        window.addEventListener('mouseleave', () => {
            mouse.active = false;
            tilt.targetX = 0;
            tilt.targetY = 0;
        });

        window.addEventListener('click', e => {
            if (e.target.closest('.modal-bd') || e.target.closest('button') || e.target.closest('.inp') || e.target.closest('.drawer')) {
                return;
            }
            triggerShockwave(e.clientX, e.clientY);
        });

        window.addEventListener('touchmove', e => {
            if (e.touches[0]) {
                mouse.x = e.touches[0].clientX;
                mouse.y = e.touches[0].clientY;
                mouse.active = true;
                tilt.targetX = (mouse.x / width - 0.5) * 5;
                tilt.targetY = (mouse.y / height - 0.5) * 5;
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            mouse.active = false;
            tilt.targetX = 0;
            tilt.targetY = 0;
        });

        // Initialize and start animation loop
        resize();
        requestAnimationFrame(render);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpaceEngine);
    } else {
        initSpaceEngine();
    }
})();
