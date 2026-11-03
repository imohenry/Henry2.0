/* Henry Imoh — blog index */
(function () {
  "use strict";

  var Blog = window.HenryBlog;
  var featuredSlot = document.getElementById("featured-post");
  var grid = document.getElementById("posts-grid");
  var tools = document.getElementById("post-tools");
  var filters = document.getElementById("topic-filters");
  var search = document.getElementById("post-search");
  var empty = document.getElementById("empty-state");
  var posts = (window.HENRY_BLOG_FALLBACK_POSTS || []).map(Blog.normalizePost);
  var activeCategory = "All";
  var query = "";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addCover(parent, post, className) {
    var cover = el("div", className);
    var url = Blog.safeImageUrl(post.coverImage);
    if (url) {
      var image = document.createElement("img");
      image.src = url;
      image.alt = "";
      image.loading = className === "featured-image" ? "eager" : "lazy";
      image.addEventListener("error", function () { image.remove(); });
      cover.appendChild(image);
    }
    parent.appendChild(cover);
  }

  function addMeta(parent, post) {
    var meta = el("div", "post-meta");
    meta.appendChild(el("span", "", Blog.formatDate(post.publishedAt)));
    meta.appendChild(el("span", "", post.readingTime + " min read"));
    parent.appendChild(meta);
  }

  function addStats(parent, post) {
    if (!post.likeCount && !post.commentCount) return;
    var stats = el("div", "post-stats");
    if (post.likeCount) stats.appendChild(el("span", "", "♥ " + post.likeCount));
    if (post.commentCount) stats.appendChild(el("span", "", "↳ " + post.commentCount));
    parent.appendChild(stats);
  }

  function makeFeatured(post) {
    var card = el("article", "featured-card");
    addCover(card, post, "featured-image");
    var copy = el("div", "featured-copy");
    var top = document.createElement("div");
    top.appendChild(el("span", "post-label", post.externalUrl ? "From the archive" : "Featured note"));
    top.appendChild(el("h2", "", post.title));
    top.appendChild(el("p", "", post.excerpt));
    copy.appendChild(top);
    var bottom = document.createElement("div");
    addMeta(bottom, post);
    var link = el("a", "post-link", post.externalUrl ? "Read on Medium" : "Read the note");
    link.href = Blog.postUrl(post);
    if (post.externalUrl) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    bottom.appendChild(link);
    copy.appendChild(bottom);
    card.appendChild(copy);
    return card;
  }

  function makeCard(post) {
    var card = el("article", "post-card");
    addCover(card, post, "post-card-image");
    var copy = el("div", "post-card-copy");
    copy.appendChild(el("span", "post-label", post.category));
    copy.appendChild(el("h3", "", post.title));
    copy.appendChild(el("p", "", post.excerpt));
    addMeta(copy, post);
    addStats(copy, post);
    var link = el("a", "post-link", post.externalUrl ? "Read on Medium" : "Read the note");
    link.href = Blog.postUrl(post);
    link.setAttribute("aria-label", (post.externalUrl ? "Read on Medium: " : "Read: ") + post.title);
    if (post.externalUrl) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    copy.appendChild(link);
    card.appendChild(copy);
    return card;
  }

  function matches(post) {
    var categoryMatch = activeCategory === "All" || post.category === activeCategory;
    var haystack = (post.title + " " + post.excerpt + " " + post.category).toLowerCase();
    return categoryMatch && (!query || haystack.indexOf(query) !== -1);
  }

  function render() {
    var visible = posts.filter(matches);
    var featured = visible.find(function (post) { return post.featured; }) || visible[0];
    featuredSlot.replaceChildren();
    grid.replaceChildren();

    if (featured) featuredSlot.appendChild(makeFeatured(featured));
    visible.filter(function (post) { return post !== featured; }).forEach(function (post) {
      grid.appendChild(makeCard(post));
    });

    var hasResults = Boolean(visible.length);
    featuredSlot.hidden = !hasResults;
    empty.hidden = hasResults;
  }

  function renderFilters() {
    var categories = ["All"];
    posts.forEach(function (post) {
      if (post.category && categories.indexOf(post.category) === -1) categories.push(post.category);
    });
    filters.replaceChildren();
    categories.forEach(function (category) {
      var button = el("button", "filter-button", category);
      button.type = "button";
      button.setAttribute("aria-pressed", category === activeCategory ? "true" : "false");
      button.addEventListener("click", function () {
        activeCategory = category;
        filters.querySelectorAll("button").forEach(function (item) {
          item.setAttribute("aria-pressed", item === button ? "true" : "false");
        });
        render();
      });
      filters.appendChild(button);
    });
    tools.hidden = posts.length < 2;
  }

  search.addEventListener("input", function () {
    query = search.value.trim().toLowerCase();
    render();
  });

  function usePosts(nextPosts) {
    posts = (nextPosts || []).map(Blog.normalizePost).filter(function (post) { return post.slug && post.title; });
    posts.sort(function (a, b) {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });
    renderFilters();
    render();
  }

  usePosts(posts);

  if (Blog.isConnected()) {
    Blog.getJSON({ action: "list" }).then(function (data) {
      if (Array.isArray(data.posts) && data.posts.length) usePosts(data.posts);
    }).catch(function (error) {
      console.warn("Using the local writing archive:", error.message);
    });
  }
})();
