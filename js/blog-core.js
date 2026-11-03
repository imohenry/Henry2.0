/* Henry Imoh — shared blog utilities (no dependencies) */
(function () {
  "use strict";

  var Blog = {};
  var API_URL = String(window.HENRY_BLOG_API_URL || "").trim();

  Blog.isConnected = function () {
    return API_URL.charAt(0) === "/" || /^https?:\/\//i.test(API_URL);
  };

  Blog.formatDate = function (value) {
    if (!value) return "";
    var date = new Date(value.length === 10 ? value + "T12:00:00" : value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  };

  Blog.normalizePost = function (post) {
    post = post || {};
    var readingTime = Number(post.readingTime || post.reading_time || 1);
    return {
      slug: String(post.slug || ""),
      title: String(post.title || "Untitled"),
      excerpt: String(post.excerpt || ""),
      content: String(post.content || ""),
      category: String(post.category || "Notes"),
      coverImage: String(post.coverImage || post.cover_image || ""),
      publishedAt: String(post.publishedAt || post.published_at || ""),
      readingTime: Number.isFinite(readingTime) ? Math.max(1, readingTime) : 1,
      featured: post.featured === true || String(post.featured).toLowerCase() === "true",
      externalUrl: String(post.externalUrl || post.external_url || ""),
      likeCount: Math.max(0, Number(post.likeCount || post.like_count || 0)),
      commentCount: Math.max(0, Number(post.commentCount || post.comment_count || 0))
    };
  };

  Blog.postUrl = function (post) {
    if (post.externalUrl) return post.externalUrl;
    return "article.html?slug=" + encodeURIComponent(post.slug);
  };

  Blog.safeImageUrl = function (value) {
    value = String(value || "").trim();
    if (!value) return "";
    if (/^(?:https?:\/\/|images\/|\.\/images\/)/i.test(value)) return value;
    return "";
  };

  Blog.getVisitorId = function () {
    var key = "henry-blog-visitor-v1";
    var value = "";
    try { value = localStorage.getItem(key) || ""; } catch (error) {}
    if (!/^[a-zA-Z0-9_-]{20,120}$/.test(value)) {
      var bytes = new Uint8Array(24);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
        value = Array.prototype.map.call(bytes, function (byte) {
          return byte.toString(16).padStart(2, "0");
        }).join("");
      } else {
        value = String(Date.now()) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      }
      try { localStorage.setItem(key, value); } catch (error) {}
    }
    return value;
  };

  Blog.hasLocalLike = function (slug) {
    try {
      var liked = JSON.parse(localStorage.getItem("henry-blog-likes-v1") || "[]");
      return Array.isArray(liked) && liked.indexOf(slug) !== -1;
    } catch (error) { return false; }
  };

  Blog.setLocalLike = function (slug, isLiked) {
    try {
      var liked = JSON.parse(localStorage.getItem("henry-blog-likes-v1") || "[]");
      if (!Array.isArray(liked)) liked = [];
      liked = liked.filter(function (item) { return item !== slug; });
      if (isLiked) liked.push(slug);
      localStorage.setItem("henry-blog-likes-v1", JSON.stringify(liked));
    } catch (error) {}
  };

  Blog.getJSON = function (params) {
    if (!Blog.isConnected()) return Promise.reject(new Error("Blog API is not configured."));
    var url = new URL(API_URL, window.location.href);
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null) url.searchParams.set(key, params[key]);
    });
    return fetch(url.toString(), { redirect: "follow", cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("The blog could not be loaded.");
        return response.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || "The blog could not be loaded.");
        return data;
      });
  };

  Blog.postJSON = function (payload) {
    if (!Blog.isConnected()) return Promise.reject(new Error("Blog API is not configured."));
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {}),
      redirect: "follow"
    }).then(function (response) {
      if (!response.ok) throw new Error("That request did not go through.");
      return response.json();
    }).then(function (data) {
      if (!data || data.ok === false) throw new Error((data && data.error) || "That request did not go through.");
      return data;
    });
  };

  function appendInline(parent, source) {
    source = String(source || "");
    var pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    var cursor = 0;
    var match;
    while ((match = pattern.exec(source))) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(source.slice(cursor, match.index)));
      var token = match[0];
      var node;
      if (token.charAt(0) === "`") {
        node = document.createElement("code");
        node.textContent = token.slice(1, -1);
      } else if (token.slice(0, 2) === "**") {
        node = document.createElement("strong");
        node.textContent = token.slice(2, -2);
      } else if (token.charAt(0) === "*") {
        node = document.createElement("em");
        node.textContent = token.slice(1, -1);
      } else {
        var linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        var href = linkMatch ? linkMatch[2].trim() : "";
        if (/^(https?:\/\/|mailto:|\/|#)/i.test(href)) {
          node = document.createElement("a");
          node.href = href;
          node.textContent = linkMatch[1];
          if (/^https?:\/\//i.test(href)) {
            node.target = "_blank";
            node.rel = "noopener noreferrer";
          }
        } else {
          node = document.createTextNode(linkMatch ? linkMatch[1] : token);
        }
      }
      parent.appendChild(node);
      cursor = match.index + token.length;
    }
    if (cursor < source.length) parent.appendChild(document.createTextNode(source.slice(cursor)));
  }

  Blog.renderMarkdown = function (container, markdown) {
    container.replaceChildren();
    var lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    var index = 0;
    var paragraph = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      var p = document.createElement("p");
      appendInline(p, paragraph.join(" "));
      container.appendChild(p);
      paragraph = [];
    }

    while (index < lines.length) {
      var line = lines[index];
      if (/^```/.test(line)) {
        flushParagraph();
        var language = line.slice(3).trim();
        var codeLines = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        var pre = document.createElement("pre");
        var code = document.createElement("code");
        if (language) code.dataset.language = language;
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
      } else if (/^#{1,3}\s+/.test(line)) {
        flushParagraph();
        var level = line.match(/^#+/)[0].length;
        var heading = document.createElement("h" + Math.min(3, level + 1));
        appendInline(heading, line.replace(/^#{1,3}\s+/, ""));
        container.appendChild(heading);
      } else if (/^>\s?/.test(line)) {
        flushParagraph();
        var quoteLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }
        var quote = document.createElement("blockquote");
        appendInline(quote, quoteLines.join(" "));
        container.appendChild(quote);
        index -= 1;
      } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        flushParagraph();
        var ordered = /^\d+\./.test(line);
        var list = document.createElement(ordered ? "ol" : "ul");
        var listPattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
        while (index < lines.length && listPattern.test(lines[index])) {
          var item = document.createElement("li");
          appendInline(item, lines[index].replace(listPattern, ""));
          list.appendChild(item);
          index += 1;
        }
        container.appendChild(list);
        index -= 1;
      } else if (/^---+$/.test(line.trim())) {
        flushParagraph();
        container.appendChild(document.createElement("hr"));
      } else if (!line.trim()) {
        flushParagraph();
      } else {
        paragraph.push(line.trim());
      }
      index += 1;
    }
    flushParagraph();
  };

  function initChrome() {
    var header = document.getElementById("blog-header");
    var toggle = document.querySelector(".blog-nav-toggle");
    var year = document.getElementById("blog-year");
    if (year) year.textContent = new Date().getFullYear();

    function updateHeader() {
      if (header) header.classList.toggle("scrolled", window.scrollY > 16);
    }
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = document.body.classList.toggle("nav-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      });
      document.querySelectorAll(".blog-nav-links a").forEach(function (link) {
        link.addEventListener("click", function () {
          document.body.classList.remove("nav-open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", "Open navigation");
        });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChrome);
  else initChrome();

  window.HenryBlog = Blog;
})();
