// ХРЕБЕТ — рельеф-карта с горизонталями. Скролл ведёт камеру по маршруту и заполняет высотный профиль.
import * as THREE from 'three';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 860px)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ | /g, ' ');

/* ------------------------------------------------------------------ */
/* Рельеф: одна и та же функция высоты для карты, маршрута и профиля    */
/* ------------------------------------------------------------------ */
const hash = (x, z) => { let n = Math.imul(x, 374761393) + Math.imul(z, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), fx), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz);
}
function height(x, z) {
  let sum = 0, amp = 1, f = 0.017, norm = 0;
  for (let o = 0; o < 5; o++) { const n = 1 - Math.abs(noise(x * f + 13.7, z * f - 4.2) * 2 - 1); sum += n * n * amp; norm += amp; amp *= 0.5; f *= 2.07; }
  const v = sum / norm;
  const wild = v * v * 46 + noise(x * 0.006 + 3, z * 0.006) * 9 + 1.5;
  // вдоль тропы рельеф «спроектирован» под реальные высоты: альплагерь → водопад → хижина Рацека → ледник
  let best = 1e9, bt = 0;
  for (let i = 0; i < WAY.length - 1; i++) {
    const ax = WAY[i][0], az = WAY[i][1], bx = WAY[i + 1][0] - ax, bz = WAY[i + 1][1] - az;
    const t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1), dx = x - ax - bx * t, dz = z - az - bz * t, d = dx * dx + dz * dz;
    if (d < best) { best = d; bt = (i + t) / (WAY.length - 1); }
  }
  let trail = TRAIL[TRAIL.length - 1][1];
  for (let i = 0; i < TRAIL.length - 1; i++) if (bt <= TRAIL[i + 1][0]) { trail = lerp(TRAIL[i][1], TRAIL[i + 1][1], sstep(TRAIL[i][0], TRAIL[i + 1][0], bt)); break; }
  const w = Math.exp(-best / 420); // ширина долины вдоль тропы
  return lerp(wild + 4, trail + (v - 0.4) * 1.2, w); // по бокам — стены ущелья
}
const LAKE = 2.0, M_PER_UNIT = 62, BASE_ALT = 1759;

/* ---------- маршрут: альплагерь Ала-Арча → водопад Ак-Сай → хижина Рацека → край ледника Ак-Сай ----------
   Высоты и расстояния примерные, по открытым путеводителям; рельеф на карте условный. */
const TOTAL_KM = 7.8;
const POINTS = [[0, 2100], [2.3, 2450], [4.5, 2860], [7.0, 3380], [7.8, 3450]]; // [км от старта, высота, м]
const STAGES = [
  { from: 0, to: 4.5, tag: 'Суббота · утро', kind: 'Подъём', title: 'К водопаду <em>Ак‑Сай</em>', end: 'Водопад Ак-Сай · ≈2 860 м',
    text: 'Стартуем от альплагеря Ала-Арча — из Бишкека туда около часа на машине. Тропа идёт ущельем вдоль реки, сквозь заросли арчи, к водопаду Ак-Сай. Здесь привал и обед.' },
  { from: 4.5, to: 7.0, tag: 'Суббота · день', kind: 'Ночёвка', title: 'Хижина <em>Рацека</em>', end: 'Хижина Рацека, ночёвка в палатках · ≈3 380 м',
    text: 'Самый крутой участок: серпантин по морене над водопадом. К вечеру выходим к хижине Рацека — ставим палатки, ужин на горелке, над лагерем пик Корона.' },
  { from: 7.0, to: 7.8, tag: 'Воскресенье', kind: 'Ледник', title: 'Рассвет у <em>ледника</em>', end: 'Край ледника Ак-Сай · ≈3 450 м',
    text: 'Утром поднимаемся к краю ледника Ак-Сай, пока тропа твёрдая и лёд в тени. После завтрака спускаемся тем же путём — к вечеру вы снова в Бишкеке.' },
];
const altKm = (km) => { for (let i = 0; i < POINTS.length - 1; i++) if (km <= POINTS[i + 1][0]) return lerp(POINTS[i][1], POINTS[i + 1][1], sstep(POINTS[i][0], POINTS[i + 1][0], km)); return POINTS[POINTS.length - 1][1]; };

/* ---------- маршрут ---------- */
const TRAIL = POINTS.map(([km, alt]) => [km / TOTAL_KM, (alt - BASE_ALT) / M_PER_UNIT]);
const WAY = [[-80, 72], [-56, 52], [-32, 34], [-10, 8], [8, -14], [20, -38], [42, -54], [60, -70], [78, -86]];
const N = 480;
const curve2 = new THREE.CatmullRomCurve3(WAY.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const ROUTE = curve2.getSpacedPoints(N - 1);
{ // высота тропы — сглаженный рельеф, чтобы линия не дрожала
  const raw = ROUTE.map((p) => Math.max(height(p.x, p.z), LAKE + 0.05));
  ROUTE.forEach((p, i) => { let s = 0, c = 0; for (let k = -6; k <= 6; k++) { const j = clamp(i + k, 0, N - 1); s += raw[j]; c++; } p.y = s / c + 0.3; });
}
const LENGTH = curve2.getLength();
const altAt = (i) => altKm((i / (N - 1)) * TOTAL_KM); // табло и профиль — по реальным точкам маршрута
const ALT = ROUTE.map((_, i) => altAt(i));
const ALT_MIN = Math.min(...ALT), ALT_MAX = Math.max(...ALT), I_MAX = ALT.indexOf(ALT_MAX);

// этапы: цифры берутся из тех же точек, что и высотный профиль
const DAYS = STAGES.map((st, d) => ({ ...st, d, a: Math.round((st.from / TOTAL_KM) * (N - 1)), b: Math.round((st.to / TOTAL_KM) * (N - 1)), km: st.to - st.from, up: altKm(st.to) - altKm(st.from), max: altKm(st.to) }));
const round10 = (n) => fmt(Math.round(n / 10) * 10);
$('days').innerHTML = DAYS.map((d) => `
  <section class="sec sec--day" id="day${d.d + 1}">
    <article class="card">
      <p class="mono card__n"><span>Этап ${d.d + 1} из ${DAYS.length} · ${d.tag}</span><b>${d.kind}</b></p>
      <h2>${d.title}</h2>
      <ul class="stats">
        <li><b>≈${d.km.toFixed(1).replace('.', ',')}</b><span>км пути</span></li>
        <li><b>≈${round10(d.up)}</b><span>м набора</span></li>
        <li><b>≈${round10(d.max)}</b><span>м высота</span></li>
      </ul>
      <p>${d.text}</p>
      <p class="card__camp"><i></i>${d.end}</p>
    </article>
  </section>`).join('');
$('kmAll').textContent = TOTAL_KM.toFixed(1).replace('.', ',');

// высотный профиль
{
  const y = (a) => 96 - ((a - ALT_MIN) / (ALT_MAX - ALT_MIN)) * 84;
  const d = `M0,100 L${ALT.map((a, i) => `${((i / (N - 1)) * 1000).toFixed(1)},${y(a).toFixed(1)}`).join(' L')} L1000,100 Z`;
  $('profBg').setAttribute('d', d); $('profFg').setAttribute('d', d);
  $('profTicks').innerHTML = STAGES.slice(0, -1).map((st) => `<line x1="${(st.to / TOTAL_KM) * 1000}" x2="${(st.to / TOTAL_KM) * 1000}" y1="0" y2="100"/>`).join('');
}

// даты и форма (заглушки)
const DATES = [['12—13 июня, сб—вс', '6 900 сом', 'мест нет'], ['3—4 июля, сб—вс', '6 900 сом', '3 места'], ['24—25 июля, сб—вс', '6 900 сом', '6 мест'], ['14—15 августа, сб—вс', '6 900 сом', '8 мест']];
let dateSel = 1;
const drawDates = () => { $('dates').innerHTML = DATES.map((d, i) => `<li><button class="date" type="button" role="radio" data-i="${i}" aria-checked="${i === dateSel}" ${i === 0 ? 'aria-disabled="true"' : ''}><b>${d[0]}</b><span>${d[2]}</span><span>${d[1]}</span></button></li>`).join(''); };
drawDates();
$('dates').addEventListener('click', (e) => { const b = e.target.closest('.date'); if (!b || b.getAttribute('aria-disabled')) return; dateSel = +b.dataset.i; drawDates(); $('dates').querySelector('[aria-checked="true"]').focus(); });
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget, n = f.elements.name, p = f.elements.phone, st = $('status');
  const okN = n.value.trim().length > 1, okP = p.value.replace(/\D/g, '').length >= 10;
  n.setAttribute('aria-invalid', String(!okN)); p.setAttribute('aria-invalid', String(!okP));
  st.classList.toggle('is-error', !(okN && okP));
  if (!okN) { st.textContent = 'Напишите, как к вам обращаться.'; n.focus(); return; }
  if (!okP) { st.textContent = 'Проверьте номер — нужно минимум 10 цифр.'; p.focus(); return; }
  st.textContent = `${n.value.trim()}, заявка на ${DATES[dateSel][0]} собрана. Демо: отправка не подключена.`;
});
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const t = document.querySelector(a.getAttribute('href')); if (!t) return;
  e.preventDefault(); t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}));
const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)), { threshold: 0.2 });
document.querySelectorAll('.sec--day .card').forEach((c) => io.observe(c));

/* ---------- скролл → положение на маршруте ---------- */
const prog = { u: 0, sIn: 0, sOut: 0 };
const daysEl = $('days');
function readScroll() {
  const r = daysEl.getBoundingClientRect(), vh = innerHeight, y = vh * 0.5;
  prog.u = clamp((y - r.top) / r.height, 0, 1);
  prog.sIn = sstep(-vh * 0.55, vh * 0.15, y - r.top);
  prog.sOut = sstep(-vh * 0.1, vh * 0.6, y - r.bottom);
  const i = Math.round(prog.u * (N - 1));
  $('alt').textContent = fmt(ALT[i]);
  $('km').textContent = (prog.u * TOTAL_KM).toFixed(1).replace('.', ',');
  $('clipRect').setAttribute('width', (prog.u * 1000).toFixed(1));
  $('profNow').setAttribute('x1', prog.u * 1000); $('profNow').setAttribute('x2', prog.u * 1000);
}
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', readScroll);
readScroll();

/* ------------------------------------------------------------------ */
/* 3D                                                                  */
/* ------------------------------------------------------------------ */
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' }); }
catch (e) { document.documentElement.classList.add('no-webgl'); document.body.classList.remove('is-loading'); }
if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  const PAPER = new THREE.Color('#efe9dc');
  renderer.setClearColor(PAPER, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 900);
  const uCam = { value: new THREE.Vector3() };

  // рельеф
  const SIZE = 300, SEG = small ? 190 : 280;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  const terrain = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { uCam, uPaper: { value: PAPER }, uInk: { value: new THREE.Color('#1f2a24') } },
    vertexShader: `varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform vec3 uCam, uPaper, uInk; varying vec3 vW;
      void main(){
        float h = vW.y;
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.) n = -n;
        float shade = smoothstep(-0.25, 0.95, dot(n, normalize(vec3(-0.55, 0.62, 0.42))));
        vec3 col = mix(vec3(0.80, 0.84, 0.72), uPaper, smoothstep(4., 15., h));
        col = mix(col, vec3(0.99, 0.985, 0.97), smoothstep(22., 32., h));
        col *= mix(0.66, 1.06, shade);
        float c = h / 1.0, c5 = h / 5.0;
        float thin = 1. - smoothstep(0., 1.3, abs(fract(c - .5) - .5) / fwidth(c));
        float bold = 1. - smoothstep(0., 1.7, abs(fract(c5 - .5) - .5) / fwidth(c5));
        float dist = length(vW - uCam);
        col = mix(col, uInk, max(thin * 0.26, bold * 0.62) * (1. - smoothstep(60., 190., dist) * 0.7));
        col = mix(col, uPaper, smoothstep(110., 250., dist));
        col = mix(col, uPaper, smoothstep(118., 148., max(abs(vW.x), abs(vW.z))));
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  scene.add(terrain);

  // озёра
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ color: '#4f9aa6', transparent: true, opacity: 0.86 }));
  water.rotation.x = -Math.PI / 2; water.position.y = LAKE; scene.add(water);

  // лес в долинах
  {
    const spots = [], want = small ? 900 : 2200; let guard = 0, seed = 1;
    const rnd = () => hash(seed++, 77);
    while (spots.length < want && guard++ < 60000) {
      const x = (rnd() - 0.5) * 230, z = (rnd() - 0.5) * 230, h = height(x, z);
      if (h < LAKE + 0.5 || h > 13 || noise(x * 0.05, z * 0.05) < 0.46) continue;
      spots.push([x, h, z, 0.6 + rnd() * 0.8]);
    }
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 1.5, 5), new THREE.MeshBasicMaterial({ color: '#33473a' }), spots.length);
    const d = new THREE.Object3D();
    spots.forEach((s, i) => { d.position.set(s[0], s[1] + 0.7 * s[3], s[2]); d.scale.setScalar(s[3]); d.updateMatrix(); trees.setMatrixAt(i, d.matrix); });
    scene.add(trees);
  }

  // маршрут: пунктир — впереди, оранжевая линия — пройдено
  const curve = new THREE.CatmullRomCurve3(ROUTE, false, 'centripetal');
  const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ROUTE.map((p) => p.clone().setY(p.y + 0.15))), new THREE.LineDashedMaterial({ color: '#1f2a24', dashSize: 1.1, gapSize: 0.9 }));
  dashed.computeLineDistances(); scene.add(dashed);
  const TUBE = 600, RAD = 6;
  const walked = new THREE.Mesh(new THREE.TubeGeometry(curve, TUBE, 0.16, RAD, false), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }));
  walked.position.y = 0.12; scene.add(walked);
  const orange = new THREE.MeshBasicMaterial({ color: '#ff5a1f' }), ink = new THREE.MeshBasicMaterial({ color: '#1f2a24' });
  DAYS.forEach((d) => { // палатки на ночёвках
    const p = ROUTE[Math.min(d.b, N - 1)];
    if (d.d === 1) { const tent = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.5, 4), orange); tent.position.set(p.x + 1.6, p.y + 0.6, p.z + 0.6); tent.rotation.y = 0.6; scene.add(tent); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4), ink); pole.position.set(p.x, p.y + 2.2, p.z); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 3), orange); flag.rotation.z = -Math.PI / 2; flag.position.set(p.x + 0.7, p.y + 3.9, p.z); scene.add(flag);
  });
  const hiker = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), orange); scene.add(hiker);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 40), new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; scene.add(halo);

  /* ---------- камера ---------- */
  const at = (u, out) => { const f = clamp(u, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)); return out.lerpVectors(ROUTE[i], ROUTE[i + 1], f - i); };
  const O1 = new THREE.Vector3(-30, 150, 190), L1 = new THREE.Vector3(0, 0, 10);
  const O2 = new THREE.Vector3(150, 95, 10), L2 = new THREE.Vector3(72, 4, -82);
  const camPos = O1.clone(), camLook = L1.clone(), here = new THREE.Vector3(), ahead = new THREE.Vector3(), dir = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let uS = prog.u;
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  const clock = new THREE.Clock(); let started = false;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (document.hidden) return;
    const time = clock.elapsedTime, k = (r) => (reduceMotion ? 1 : 1 - Math.exp(-dt * r));
    uS = lerp(uS, prog.u, k(4));
    at(uS, here); at(uS + 0.05, ahead);
    dir.subVectors(ahead, here).setY(0); if (dir.lengthSq() < 1e-6) dir.set(1, 0, -1); dir.normalize();
    // камера идёт за спиной путника, чуть сбоку
    const back = camera.aspect < 0.8 ? 30 : 24;
    wantPos.copy(here).addScaledVector(dir, -back).add(new THREE.Vector3(-dir.z * 4, 17, dir.x * 4));
    wantPos.y = Math.max(wantPos.y, height(wantPos.x, wantPos.z) + 4);
    // линия взгляда: если между камерой и путником гора — поднимаем камеру над ней
    for (let k = 0; k < 10; k++) {
      const t = k / 10, sx = lerp(wantPos.x, here.x, t), sz = lerp(wantPos.z, here.z, t);
      const lineY = lerp(wantPos.y, here.y + 1, t), ground = height(sx, sz) + 2.5;
      if (ground > lineY) wantPos.y += (ground - lineY) / (1 - t);
    }
    wantLook.copy(here).addScaledVector(dir, 7); wantLook.y += 1.5;
    const orbit = reduceMotion ? 0 : Math.sin(time * 0.12) * 14;
    wantPos.lerpVectors(O1.clone().setX(O1.x + orbit), wantPos, prog.sIn).lerp(O2, prog.sOut);
    wantLook.lerpVectors(L1, wantLook, prog.sIn).lerp(L2, prog.sOut);
    camPos.lerp(wantPos, k(2.6)); camLook.lerp(wantLook, k(3));
    camera.position.copy(camPos); camera.lookAt(camLook);
    uCam.value.copy(camPos);

    walked.geometry.setDrawRange(0, Math.floor(uS * TUBE) * RAD * 6);
    hiker.position.copy(here).setY(here.y + 0.75 + (reduceMotion ? 0 : Math.abs(Math.sin(time * 5)) * 0.12));
    const pulse = (time * 0.8) % 1;
    halo.position.copy(here).setY(here.y + 0.35); halo.scale.setScalar(1 + pulse * 3.2); halo.material.opacity = (1 - pulse) * 0.8;

    renderer.render(scene, camera);
    if (!started) { started = true; document.body.classList.remove('is-loading'); }
  }
  frame();
}
