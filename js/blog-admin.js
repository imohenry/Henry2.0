/* Henry Imoh — lightweight blog publishing desk */
(function () {
  "use strict";

  var Blog = window.HenryBlog;
  var API_URL = String(window.HENRY_BLOG_ADMIN_API_URL || "/api/blog-admin");
  var localPreview = location.hostname === "localhost" && new URLSearchParams(location.search).get("preview") === "1";
  var state = {
    posts: [],
    comments: [],
    currentSlug: "",
    originalSlug: "",
    currentStatus: "draft",
    commentFilter: "pending",
    dirty: false,
    preview: localPreview
  };
  var autoSlug = true;
  var autoReadingTime = true;
  var toastTimer = null;

  var loginView = document.getElementById("login-view");
  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var adminApp = document.getElementById("admin-app");
  var postForm = document.getElementById("post-form");
  var postList = document.getElementById("admin-post-list");
  var postSearch = document.getElementById("admin-post-search");
  var commentsList = document.getElementById("moderation-list");
  var deleteDialog = document.getElementById("delete-dialog");
  var toast = document.getElementById("admin-toast");

  var fields = {
    title: document.getElementById("post-title"),
    slug: document.getElementById("post-slug"),
    excerpt: document.getElementById("post-excerpt"),
    category: document.getElementById("post-category"),
    coverImage: document.getElementById("post-cover"),
    publishedAt: document.getElementById("post-date"),
    readingTime: document.getElementById("post-reading-time"),
    featured: document.getElementById("post-featured"),
    externalUrl: document.getElementById("post-external"),
    content: document.getElementById("post-content")
  };

  function adminURL(action) {
    var url = new URL(API_URL, location.href);
    url.searchParams.set("action", action);
    return url.toString();
  }

  function api(action, options) {
    options = options || {};
    var init = {
      method: options.method || "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {}
    };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(adminURL(action), init).then(function (response) {
      return response.json().catch(function () {
        throw new Error("The admin service returned an unreadable response.");
      }).then(function (data) {
        if (!response.ok || !data || data.ok === false) {
          var error = new Error((data && data.error) || "That request did not go through.");
          error.status = response.status;
          error.authenticated = data && data.authenticated;
          throw error;
        }
        return data;
      });
    });
  }

  function showLogin(message) {
    state.dirty = false;
    adminApp.hidden = true;
    loginView.hidden = false;
    loginStatus.hidden = !message;
    loginStatus.textContent = message || "";
    window.setTimeout(function () { document.getElementById("admin-password").focus(); }, 0);
  }

  function showApp() {
    loginView.hidden = true;
    adminApp.hidden = false;
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 3600);
  }

  function todayInLagos() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + "-" + values.month + "-" + values.day;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function wordCount(value) {
    value = String(value || "").trim();
    return value ? value.split(/\s+/).length : 0;
  }

  function normalizePost(raw) {
    var post = Blog.normalizePost(raw);
    post.status = raw && raw.status === "published" ? "published" : "draft";
    return post;
  }

  function sampleData() {
    var archive = (window.HENRY_BLOG_FALLBACK_POSTS || []).slice(0, 2).map(function (post) {
      return Object.assign(normalizePost(post), { status: "published" });
    });
    archive.unshift(normalizePost({
      slug: "a-lightweight-writing-desk",
      title: "A lightweight writing desk",
      excerpt: "A private place to shape an idea, preview it safely, and publish it without leaving the portfolio.",
      category: "Engineering",
      publishedAt: todayInLagos(),
      readingTime: 3,
      featured: false,
      status: "draft",
      content: "## The useful part\n\nThis is a local preview of the native editor. It supports **Markdown**, links, lists, quotes, and code.\n\n- Write without distractions\n- Preview as you go\n- Publish to Google Sheets\n\n> Lightweight should still feel considered."
    }));
    return {
      posts: archive,
      comments: [
        { id: "preview-1", postSlug: archive[0].slug, author: "A thoughtful reader", body: "The explanation was clear. I would love to hear more about the trade-offs.", createdAt: new Date().toISOString(), status: "pending" },
        { id: "preview-2", postSlug: archive[1].slug, author: "Archive reader", body: "This one stayed with me. Thanks for writing it.", createdAt: new Date(Date.now() - 86400000).toISOString(), status: "approved" }
      ]
    };
  }

  function applyData(data, selectedSlug) {
    state.posts = (data.posts || []).map(normalizePost);
    state.comments = Array.isArray(data.comments) ? data.comments.slice() : [];
    renderPostList();
    renderComments();
    updateCounts();

    var chosen = state.posts.find(function (post) { return post.slug === selectedSlug; }) || state.posts[0];
    if (chosen) openPost(chosen, true);
    else newPost(true);
  }

  function loadData(selectedSlug) {
    if (state.preview) {
      if (!state.posts.length) applyData(sampleData(), selectedSlug);
      else applyData({ posts: state.posts, comments: state.comments }, selectedSlug);
      return Promise.resolve();
    }
    return api("data").then(function (data) {
      applyData(data, selectedSlug || state.currentSlug);
    }).catch(function (error) {
      if (error.status === 401) showLogin("Your session expired. Sign in again.");
      else showToast(error.message, true);
    });
  }

  function updateCounts() {
    document.getElementById("post-total").textContent = state.posts.length + (state.posts.length === 1 ? " post" : " posts");
    document.getElementById("pending-count").textContent = state.comments.filter(function (comment) { return comment.status === "pending"; }).length;
  }

  function renderPostList() {
    var query = postSearch.value.trim().toLowerCase();
    var visible = state.posts.filter(function (post) {
      return !query || (post.title + " " + post.category + " " + post.status).toLowerCase().indexOf(query) !== -1;
    });
    postList.replaceChildren();
    visible.forEach(function (post) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "post-list-item" + (state.currentSlug === post.slug ? " active" : "");
      button.setAttribute("role", "listitem");
      var title = document.createElement("strong");
      title.textContent = post.title;
      var meta = document.createElement("span");
      meta.className = "post-list-meta";
      var date = document.createElement("span");
      date.textContent = Blog.formatDate(post.publishedAt);
      var status = document.createElement("span");
      status.className = "mini-status " + post.status;
      status.textContent = post.status;
      meta.append(date, status);
      button.append(title, meta);
      button.addEventListener("click", function () {
        if (!canLeaveEditor()) return;
        openPost(post, true);
      });
      postList.appendChild(button);
    });
  }

  function blankPost() {
    return {
      slug: "",
      title: "",
      excerpt: "",
      content: "",
      category: "Notes",
      coverImage: "",
      publishedAt: todayInLagos(),
      readingTime: 1,
      featured: false,
      externalUrl: "",
      status: "draft",
      likeCount: 0,
      commentCount: 0
    };
  }

  function setFields(post) {
    Object.keys(fields).forEach(function (key) {
      if (key === "featured") fields[key].checked = Boolean(post[key]);
      else fields[key].value = post[key] === undefined ? "" : post[key];
    });
    state.currentStatus = post.status === "published" ? "published" : "draft";
    document.getElementById("post-state-output").textContent = state.currentStatus === "published" ? "Published" : "Draft";
    document.getElementById("delete-post-button").hidden = !state.originalSlug;
    document.getElementById("publish-button").textContent = state.currentStatus === "published" ? "Update published post" : "Publish post";
    updateStatusLine();
    updatePreview();
  }

  function openPost(post, clean) {
    state.currentSlug = post.slug;
    state.originalSlug = post.slug;
    autoSlug = false;
    autoReadingTime = false;
    setFields(post);
    if (clean) markClean("Saved in Google Sheets");
    renderPostList();
  }

  function newPost(force) {
    if (!force && !canLeaveEditor()) return;
    state.currentSlug = "";
    state.originalSlug = "";
    autoSlug = true;
    autoReadingTime = true;
    setFields(blankPost());
    markClean("Not saved yet");
    fields.title.focus();
    renderPostList();
  }

  function updateStatusLine() {
    var published = state.currentStatus === "published";
    document.getElementById("editor-status-label").textContent = state.originalSlug ? (published ? "Published post" : "Draft post") : "New draft";
    document.getElementById("editor-status-dot").classList.toggle("published", published);
  }

  function markDirty() {
    state.dirty = true;
    document.getElementById("save-note").textContent = "Unsaved changes";
  }

  function markClean(note) {
    state.dirty = false;
    document.getElementById("save-note").textContent = note || "Saved";
  }

  function canLeaveEditor() {
    return !state.dirty || window.confirm("Discard the unsaved changes to this post?");
  }

  function updatePreview() {
    var title = fields.title.value.trim();
    var excerpt = fields.excerpt.value.trim();
    var category = fields.category.value.trim() || "Notes";
    var words = wordCount(fields.content.value);
    var time = Math.max(1, Number(fields.readingTime.value) || 1);
    var imageUrl = Blog.safeImageUrl(fields.coverImage.value);
    var cover = document.getElementById("preview-cover");

    document.getElementById("preview-title").textContent = title || "Your title will live here.";
    document.getElementById("preview-excerpt").textContent = excerpt || "The excerpt sets up the story before the reader begins.";
    document.getElementById("preview-category").textContent = category;
    document.getElementById("preview-date").textContent = Blog.formatDate(fields.publishedAt.value || todayInLagos());
    document.getElementById("preview-time").textContent = time + " min read";
    document.getElementById("word-count").textContent = words + (words === 1 ? " word" : " words");
    document.getElementById("excerpt-count").textContent = fields.excerpt.value.length + "/500";

    if (imageUrl) {
      if (cover.src !== new URL(imageUrl, location.href).href) cover.src = imageUrl;
      cover.hidden = false;
    } else {
      cover.hidden = true;
      cover.removeAttribute("src");
    }

    var external = Boolean(fields.externalUrl.value.trim());
    document.getElementById("preview-external").hidden = !external;
    document.getElementById("preview-body").hidden = external;
    if (!external) {
      Blog.renderMarkdown(
        document.getElementById("preview-body"),
        fields.content.value || "Start writing to see the article take shape."
      );
    }
  }

  function collectPost(status) {
    return {
      title: fields.title.value.trim(),
      slug: fields.slug.value.trim(),
      excerpt: fields.excerpt.value.trim(),
      content: fields.content.value.trim(),
      category: fields.category.value.trim() || "Notes",
      coverImage: fields.coverImage.value.trim(),
      publishedAt: fields.publishedAt.value || todayInLagos(),
      readingTime: Math.max(1, Number(fields.readingTime.value) || 1),
      featured: fields.featured.checked,
      externalUrl: fields.externalUrl.value.trim(),
      status: status
    };
  }

  function validatePost(post) {
    if (!post.title) return "Add a title first.";
    if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(post.slug)) return "Use a lowercase slug with words separated by hyphens.";
    if (!post.excerpt) return "Add a short excerpt first.";
    if (post.coverImage && !/^https:\/\//i.test(post.coverImage)) return "Use an HTTPS cover image URL.";
    if (post.externalUrl && !/^https:\/\//i.test(post.externalUrl)) return "Use an HTTPS external article URL.";
    if (post.status === "published" && !post.externalUrl && !post.content) return "Write the article before publishing it.";
    return "";
  }

  function savePost(status) {
    var post = collectPost(status);
    var message = validatePost(post);
    if (message) { showToast(message, true); return; }

    var buttons = [document.getElementById("save-draft-button"), document.getElementById("publish-button")];
    buttons.forEach(function (button) { button.disabled = true; });

    if (state.preview) {
      var existing = state.posts.findIndex(function (item) { return item.slug === state.originalSlug; });
      var normalized = normalizePost(post);
      if (existing >= 0) state.posts[existing] = normalized;
      else state.posts.unshift(normalized);
      state.currentSlug = post.slug;
      state.originalSlug = post.slug;
      state.currentStatus = status;
      markClean("Saved in local preview");
      renderPostList();
      updateCounts();
      setFields(normalized);
      showToast(status === "published" ? "Preview post published." : "Preview draft saved.");
      buttons.forEach(function (button) { button.disabled = false; });
      return;
    }

    api("savePost", {
      method: "POST",
      body: { originalSlug: state.originalSlug, post: post }
    }).then(function () {
      state.currentSlug = post.slug;
      state.originalSlug = post.slug;
      state.currentStatus = status;
      markClean(status === "published" ? "Published just now" : "Draft saved just now");
      showToast(status === "published" ? "Post published." : "Draft saved.");
      return loadData(post.slug);
    }).catch(function (error) {
      if (error.status === 401) showLogin("Your session expired. Sign in again.");
      else showToast(error.message, true);
    }).finally(function () {
      buttons.forEach(function (button) { button.disabled = false; });
    });
  }

  function deleteCurrentPost() {
    if (!state.originalSlug) return;
    var slug = state.originalSlug;
    if (state.preview) {
      state.posts = state.posts.filter(function (post) { return post.slug !== slug; });
      state.comments = state.comments.filter(function (comment) { return comment.postSlug !== slug; });
      state.dirty = false;
      applyData({ posts: state.posts, comments: state.comments }, "");
      showToast("Preview post deleted.");
      return;
    }
    document.getElementById("confirm-delete-button").disabled = true;
    api("deletePost", { method: "POST", body: { slug: slug } }).then(function () {
      state.dirty = false;
      showToast("Post deleted.");
      return loadData("");
    }).catch(function (error) {
      showToast(error.message, true);
    }).finally(function () {
      document.getElementById("confirm-delete-button").disabled = false;
    });
  }

  function setAdminView(view) {
    document.getElementById("posts-view").hidden = view !== "posts";
    document.getElementById("comments-view").hidden = view !== "comments";
    document.querySelectorAll(".admin-tab").forEach(function (tab) {
      var active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function postTitle(slug) {
    var post = state.posts.find(function (item) { return item.slug === slug; });
    return post ? post.title : slug;
  }

  function renderComments() {
    var visible = state.comments.filter(function (comment) {
      return state.commentFilter === "all" || comment.status === state.commentFilter;
    });
    commentsList.replaceChildren();
    document.getElementById("comments-empty").hidden = Boolean(visible.length);

    visible.forEach(function (comment) {
      var card = document.createElement("article");
      card.className = "moderation-card";
      var top = document.createElement("div");
      top.className = "moderation-top";
      var identity = document.createElement("div");
      var author = document.createElement("strong");
      author.textContent = comment.author || "Reader";
      var context = document.createElement("span");
      context.textContent = " on “" + postTitle(comment.postSlug) + "” · " + Blog.formatDate(comment.createdAt);
      identity.append(author, context);
      var status = document.createElement("span");
      status.className = "moderation-status " + comment.status;
      status.textContent = comment.status;
      top.append(identity, status);
      var body = document.createElement("blockquote");
      body.textContent = comment.body || "";
      var actions = document.createElement("div");
      actions.className = "moderation-actions";
      ["approved", "pending", "rejected"].forEach(function (nextStatus) {
        if (nextStatus === comment.status) return;
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.status = nextStatus;
        button.textContent = nextStatus === "approved" ? "Approve" : nextStatus === "rejected" ? "Reject" : "Move to pending";
        button.addEventListener("click", function () { moderateComment(comment, nextStatus, button); });
        actions.appendChild(button);
      });
      card.append(top, body, actions);
      commentsList.appendChild(card);
    });
  }

  function moderateComment(comment, status, button) {
    button.disabled = true;
    if (state.preview) {
      comment.status = status;
      renderComments();
      updateCounts();
      showToast("Preview comment moved to " + status + ".");
      return;
    }
    api("moderateComment", { method: "POST", body: { id: comment.id, status: status } })
      .then(function () {
        comment.status = status;
        renderComments();
        updateCounts();
        showToast("Comment moved to " + status + ".");
      })
      .catch(function (error) { showToast(error.message, true); })
      .finally(function () { button.disabled = false; });
  }

  function applyFormat(format) {
    var field = fields.content;
    var start = field.selectionStart;
    var end = field.selectionEnd;
    var selected = field.value.slice(start, end);
    var before = "";
    var after = "";
    var replacement = selected;
    if (format === "heading") { before = "## "; replacement = selected || "Section heading"; }
    if (format === "bold") { before = "**"; after = "**"; replacement = selected || "bold text"; }
    if (format === "italic") { before = "*"; after = "*"; replacement = selected || "italic text"; }
    if (format === "link") { before = "["; after = "](https://example.com)"; replacement = selected || "link text"; }
    if (format === "quote") { before = "> "; replacement = selected || "A useful quote"; }
    if (format === "list") {
      replacement = (selected || "First point\nSecond point").split("\n").map(function (line) { return "- " + line; }).join("\n");
    }
    if (format === "code") { before = "```\n"; after = "\n```"; replacement = selected || "code goes here"; }
    var inserted = before + replacement + after;
    field.setRangeText(inserted, start, end, "end");
    field.focus();
    markDirty();
    updatePreview();
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var submit = loginForm.querySelector('[type="submit"]');
    var password = document.getElementById("admin-password");
    submit.disabled = true;
    submit.textContent = "Opening…";
    loginStatus.hidden = true;
    api("login", { method: "POST", body: { password: password.value } })
      .then(function () {
        password.value = "";
        showApp();
        return loadData();
      })
      .catch(function (error) {
        loginStatus.textContent = error.message;
        loginStatus.hidden = false;
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = "Open the desk";
      });
  });

  document.getElementById("logout-button").addEventListener("click", function () {
    if (!canLeaveEditor()) return;
    if (state.preview) { showLogin("Local preview closed."); return; }
    api("logout", { method: "POST", body: {} }).finally(function () {
      showLogin("");
    });
  });

  document.getElementById("new-post-button").addEventListener("click", function () { newPost(false); });
  postForm.addEventListener("submit", function (event) {
    event.preventDefault();
    savePost(state.currentStatus);
  });
  postSearch.addEventListener("input", renderPostList);
  document.getElementById("save-draft-button").addEventListener("click", function () { savePost("draft"); });
  document.getElementById("publish-button").addEventListener("click", function () { savePost("published"); });
  document.getElementById("delete-post-button").addEventListener("click", function () { deleteDialog.showModal(); });
  deleteDialog.addEventListener("close", function () { if (deleteDialog.returnValue === "delete") deleteCurrentPost(); });

  document.querySelectorAll(".admin-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      if (tab.dataset.view !== "posts" && !canLeaveEditor()) return;
      setAdminView(tab.dataset.view);
    });
  });
  document.querySelectorAll("[data-comment-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.commentFilter = button.dataset.commentFilter;
      document.querySelectorAll("[data-comment-filter]").forEach(function (item) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      renderComments();
    });
  });
  document.querySelectorAll("[data-format]").forEach(function (button) {
    button.addEventListener("click", function () { applyFormat(button.dataset.format); });
  });

  fields.title.addEventListener("input", function () {
    if (autoSlug) fields.slug.value = slugify(fields.title.value);
  });
  fields.slug.addEventListener("input", function () { autoSlug = false; });
  fields.readingTime.addEventListener("input", function () { autoReadingTime = false; });
  fields.content.addEventListener("input", function () {
    if (autoReadingTime) fields.readingTime.value = Math.max(1, Math.ceil(wordCount(fields.content.value) / 220));
  });
  Object.keys(fields).forEach(function (key) {
    fields[key].addEventListener("input", function () { markDirty(); updatePreview(); });
    fields[key].addEventListener("change", function () { markDirty(); updatePreview(); });
  });
  document.getElementById("preview-cover").addEventListener("error", function () {
    document.getElementById("preview-cover").hidden = true;
  });
  window.addEventListener("beforeunload", function (event) {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  if (state.preview) {
    showApp();
    applyData(sampleData(), "a-lightweight-writing-desk");
    showToast("Local admin preview — nothing here writes to Google Sheets.");
  } else {
    api("session").then(function (data) {
      if (!data.authenticated) { showLogin(""); return; }
      showApp();
      return loadData();
    }).catch(function (error) {
      showLogin(error.message);
    });
  }
})();
