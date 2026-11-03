(() => {
    'use strict';

    const canvas = document.getElementById('space-bg');
    const context = canvas && canvas.getContext('2d', { alpha: false });
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const random = (min, max) => min + Math.random() * (max - min);
    const stars = Array.from({ length: 110 }, () => ({
        x: Math.random(),
        y: Math.random(),
        radius: random(0.35, 1.35),
        phase: random(0, Math.PI * 2),
        speed: random(0.15, 0.6)
    }));
    const rocks = Array.from({ length: 11 }, (_, index) => {
        const sides = 7 + Math.floor(Math.random() * 4);
        const points = Array.from({ length: sides }, (_, side) => {
            const angle = side / sides * Math.PI * 2;
            const radius = random(0.73, 1.16);
            return [Math.cos(angle) * radius, Math.sin(angle) * radius];
        });
        return {
            x: Math.random(),
            y: Math.random(),
            size: random(15, 43),
            points,
            rotation: random(0, Math.PI * 2),
            spin: random(-0.035, 0.035),
            driftX: random(-0.006, 0.006),
            driftY: random(0.002, 0.009),
            alpha: random(0.12, 0.36),
            hue: index % 2 ? 196 : 326
        };
    });
    const meteors = [];
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let lastFrame = 0;
    let lastMeteor = 0;
    let animationFrame = 0;

    function resize() {
        pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function drawRock(rock, delta) {
        rock.x += rock.driftX * delta;
        rock.y += rock.driftY * delta;
        rock.rotation += rock.spin * delta;
        if (rock.x < -0.15) rock.x = 1.15;
        if (rock.x > 1.15) rock.x = -0.15;
        if (rock.y > 1.2) rock.y = -0.2;

        const x = rock.x * width;
        const y = rock.y * height;
        const radius = rock.size;
        context.save();
        context.translate(x, y);
        context.rotate(rock.rotation);
        context.beginPath();
        rock.points.forEach(([px, py], index) => {
            const pointX = px * radius;
            const pointY = py * radius * 0.72;
            if (index === 0) context.moveTo(pointX, pointY);
            else context.lineTo(pointX, pointY);
        });
        context.closePath();
        const surface = context.createLinearGradient(-radius, -radius, radius, radius);
        surface.addColorStop(0, `rgba(66, 78, 94, ${rock.alpha})`);
        surface.addColorStop(0.55, `rgba(24, 29, 42, ${rock.alpha + 0.08})`);
        surface.addColorStop(1, `rgba(4, 8, 15, ${rock.alpha})`);
        context.fillStyle = surface;
        context.strokeStyle = `hsla(${rock.hue}, 90%, 65%, ${rock.alpha * 0.8})`;
        context.lineWidth = 1;
        context.shadowBlur = 16;
        context.shadowColor = `hsla(${rock.hue}, 90%, 55%, ${rock.alpha * 0.4})`;
        context.fill();
        context.stroke();
        context.restore();
    }

    function addMeteor() {
        const x = random(width * 0.12, width * 1.02);
        const y = random(-height * 0.12, height * 0.58);
        const length = random(70, 180);
        const angle = random(Math.PI * 0.56, Math.PI * 0.78);
        meteors.push({
            x, y,
            vx: Math.cos(angle) * random(260, 440),
            vy: Math.sin(angle) * random(260, 440),
            length,
            life: 0,
            duration: random(0.8, 1.45),
            hue: Math.random() > 0.5 ? 195 : 329
        });
    }

    function drawMeteor(meteor, delta) {
        meteor.x += meteor.vx * delta;
        meteor.y += meteor.vy * delta;
        meteor.life += delta;
        const opacity = Math.max(0, 1 - meteor.life / meteor.duration);
        const tailX = meteor.x - meteor.vx / 430 * meteor.length;
        const tailY = meteor.y - meteor.vy / 430 * meteor.length;
        const tail = context.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        tail.addColorStop(0, `hsla(${meteor.hue}, 100%, 83%, ${opacity})`);
        tail.addColorStop(0.22, `hsla(${meteor.hue}, 100%, 65%, ${opacity * 0.65})`);
        tail.addColorStop(1, `hsla(${meteor.hue}, 100%, 55%, 0)`);
        context.beginPath();
        context.moveTo(meteor.x, meteor.y);
        context.lineTo(tailX, tailY);
        context.strokeStyle = tail;
        context.lineWidth = 2;
        context.shadowBlur = 14;
        context.shadowColor = `hsla(${meteor.hue}, 100%, 68%, ${opacity})`;
        context.stroke();
        context.shadowBlur = 0;
    }

    function frame(timestamp) {
        const delta = Math.min((timestamp - (lastFrame || timestamp)) / 1000, 0.05);
        lastFrame = timestamp;
        context.fillStyle = '#0A0A0D';
        context.fillRect(0, 0, width, height);

        const haze = context.createRadialGradient(width * 0.72, height * 0.22, 0, width * 0.72, height * 0.22, Math.max(width, height) * 0.72);
        haze.addColorStop(0, 'rgba(0, 123, 167, 0.2)');
        haze.addColorStop(0.48, 'rgba(255, 45, 149, 0.085)');
        haze.addColorStop(1, 'rgba(10, 10, 13, 0)');
        context.fillStyle = haze;
        context.fillRect(0, 0, width, height);

        stars.forEach(star => {
            const twinkle = 0.3 + (Math.sin(timestamp / 1000 * star.speed + star.phase) + 1) * 0.28;
            context.beginPath();
            context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(192, 224, 242, ${twinkle})`;
            context.fill();
        });
        rocks.forEach(rock => drawRock(rock, delta));

        if (!reducedMotion && timestamp - lastMeteor > random(1500, 3200)) {
            addMeteor();
            lastMeteor = timestamp;
        }
        for (let index = meteors.length - 1; index >= 0; index -= 1) {
            drawMeteor(meteors[index], delta);
            if (meteors[index].life >= meteors[index].duration) meteors.splice(index, 1);
        }
        if (!reducedMotion) animationFrame = window.requestAnimationFrame(frame);
    }

    function start() {
        window.cancelAnimationFrame(animationFrame);
        lastFrame = 0;
        frame(performance.now());
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) window.cancelAnimationFrame(animationFrame);
        else start();
    });
    resize();
    start();
})();
