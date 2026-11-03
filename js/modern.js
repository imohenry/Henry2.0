/* Henry Imoh — modern theme JS (no dependencies) */
(function () {
  "use strict";

  /* ===== WebGL molten-light hero background ===== */
  var heroCanvas = document.getElementById("heroCanvas");
  if (heroCanvas) initHero(heroCanvas);

  function initHero(canvas) {
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false }) ||
             canvas.getContext("experimental-webgl");
    if (!gl) { canvas.style.display = "none"; return; }

    var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var FRAG = [
      "precision highp float;",
      "uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;",
      "vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));",
      "return -1.+2.*fract(sin(p)*43758.5453123);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
      "return mix(mix(dot(h2(i),f),dot(h2(i+vec2(1,0)),f-vec2(1,0)),u.x),",
      "mix(dot(h2(i+vec2(0,1)),f-vec2(0,1)),dot(h2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}",
      "float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);",
      "for(int i=0;i<4;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}",
      "void main(){",
      "vec2 uv=gl_FragCoord.xy/u_res.xy;",
      "vec2 p=(gl_FragCoord.xy-.5*u_res.xy)/u_res.y;",
      "float t=u_time*.15;",
      "vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));",
      "vec2 r=vec2(fbm(p+3.5*q+vec2(1.7,9.2)+.15*t),fbm(p+3.5*q+vec2(8.3,2.8)-.12*t));",
      "float f=fbm(p+3.5*r);",
      "vec2 md=uv-u_mouse;md.x*=u_res.x/u_res.y;",
      "f+=.22*smoothstep(.65,0.,length(md));",
      "vec3 c1=vec3(.02,.03,.07),c2=vec3(.08,.15,.32),c3=vec3(.20,.36,.66),c4=vec3(.66,.78,1.);",
      "vec3 col=mix(c1,c2,smoothstep(0.,.55,f));",
      "col=mix(col,c3,smoothstep(.4,.9,f));",
      "col=mix(col,c4,smoothstep(.72,1.05,f));",
      "float vig=smoothstep(1.3,.2,length(p));",
      "col*=.55+.45*vig;",
      "gl_FragColor=vec4(col,1.);}"
    ].join("");

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = "none"; return; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uTime = gl.getUniformLocation(prog, "u_time");
    var uMouse = gl.getUniformLocation(prog, "u_mouse");

    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    var SCALE = 0.6; // render below CSS size — the plasma is soft, so it's free quality
    function resize() {
      var w = Math.max(1, Math.round(canvas.clientWidth * DPR * SCALE));
      var h = Math.max(1, Math.round(canvas.clientHeight * DPR * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    }
    window.addEventListener("resize", resize, { passive: true });
    resize();

    var mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    window.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width;
      tmy = 1 - (e.clientY - r.top) / r.height;
    }, { passive: true });

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var visible = true;
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; })
      .observe(canvas);

    var raf, t0 = null;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (t0 === null) t0 = now;
      mx += (tmx - mx) * 0.06;
      my += (tmy - my) * 0.06;
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uTime, reduce ? 8.0 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (reduce) cancelAnimationFrame(raf); // draw one static frame only
    }
    raf = requestAnimationFrame(frame);
  }

  /* sticky header */
  var header = document.querySelector(".site-header");
  var toTop = document.getElementById("to-top");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 30);
    if (toTop) toTop.classList.toggle("show", y > 600);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* mobile nav */
  var navToggle = document.querySelector(".nav-toggle");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* scroll reveal */
  var revealEls = document.querySelectorAll(".reveal");
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach(function (el) { io.observe(el); });

  /* skill bars + see-more toggle */
  var barsWrap = document.querySelector(".skills");
  function fillBars() {
    barsWrap.querySelectorAll(".bar i").forEach(function (b) {
      if (b.offsetParent !== null) b.style.width = b.dataset.level + "%";
    });
  }
  if (barsWrap) {
    new IntersectionObserver(
      function (entries, obs) {
        if (entries[0].isIntersecting) {
          fillBars();
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    ).observe(barsWrap);

    var skillsToggle = document.querySelector(".skills-toggle");
    if (skillsToggle) {
      skillsToggle.addEventListener("click", function () {
        var open = barsWrap.classList.toggle("show-all");
        skillsToggle.setAttribute("aria-expanded", open ? "true" : "false");
        skillsToggle.firstChild.textContent = open ? "See fewer skills" : "See more skills";
        if (open) requestAnimationFrame(fillBars);
      });
    }
  }

  /* stat count-up */
  document.querySelectorAll("[data-count]").forEach(function (el) {
    new IntersectionObserver(
      function (entries, obs) {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        var target = parseInt(el.dataset.count, 10);
        var start = null;
        function step(t) {
          if (!start) start = t;
          var p = Math.min((t - start) / 1600, 1);
          el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    ).observe(el);
  });

  /* typing greeting */
  var typeEl = document.querySelector("[data-type]");
  if (typeEl) {
    var words = JSON.parse(typeEl.dataset.type);
    var span = typeEl.querySelector(".type-text");
    var wi = 0, ci = 0, deleting = false;
    (function tick() {
      var word = words[wi];
      ci += deleting ? -1 : 1;
      span.textContent = word.slice(0, ci);
      var delay = deleting ? 45 : 95;
      if (!deleting && ci === word.length) { delay = 1800; deleting = true; }
      else if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; delay = 350; }
      setTimeout(tick, delay);
    })();
  }

  /* portfolio filters */
  var filterBtns = document.querySelectorAll(".filters button");
  var projectGrid = document.querySelector("#portfolio .work-grid");
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var f = btn.dataset.filter;
      (projectGrid ? projectGrid.querySelectorAll(".work-card") : []).forEach(function (card) {
        card.classList.toggle("hidden", f !== "all" && card.dataset.cat !== f);
      });
    });
  });

  /* shared modal (portfolio + photography) */
  var modal = document.getElementById("modal");
  if (modal) {
    var lastFocused = null;
    var mImg = modal.querySelector(".modal-img");
    var mTitle = modal.querySelector(".modal-title");
    var mDesc = modal.querySelector(".modal-desc");
    var mCat = modal.querySelector(".modal-cat");
    var mLink = modal.querySelector(".modal-link");

    function openModal(d) {
      lastFocused = document.activeElement;
      mImg.src = d.img || "";
      mImg.alt = d.title || "";
      mTitle.textContent = d.title || "";
      mDesc.innerHTML = d.desc || "";
      if (mCat) mCat.textContent = d.tag || "";
      if (mLink) {
        if (d.link && d.link !== "#") {
          mLink.href = d.link;
          mLink.style.display = "";
        } else {
          mLink.style.display = "none";
        }
      }
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      modal.querySelector(".modal-close").focus();
    }
    function closeModal() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocused) lastFocused.focus();
    }

    document.querySelectorAll("[data-modal]").forEach(function (card) {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("click", function () {
        openModal(card.dataset);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal(card.dataset);
        }
      });
    });
    modal.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }
})();
