/* Henry Imoh — article reader, likes and moderated comments */
(function () {
  "use strict";

  var Blog = window.HenryBlog;
  var slug = new URLSearchParams(window.location.search).get("slug") || "";
  var loading = document.getElementById("article-loading");
  var article = document.getElementById("article");
  var errorBox = document.getElementById("article-error");
  var errorCopy = document.getElementById("article-error-copy");
  var currentPost = null;

  function showError(message) {
    loading.hidden = true;
    article.hidden = true;
    errorCopy.textContent = message || "It may have moved, or the blog may be having a quiet moment.";
    errorBox.hidden = false;
  }

  function updateMeta(post) {
    document.title = post.title + " — Henry Imoh";
    var description = document.querySelector('meta[name="description"]');
    var ogTitle = document.querySelector('meta[property="og:title"]');
    var ogDescription = document.querySelector('meta[property="og:description"]');
    if (description) description.content = post.excerpt;
    if (ogTitle) ogTitle.content = post.title;
    if (ogDescription) ogDescription.content = post.excerpt;
  }

  function renderComments(comments) {
    var list = document.getElementById("comment-list");
    var none = document.getElementById("no-comments");
    list.replaceChildren();
    (comments || []).forEach(function (comment) {
      var item = document.createElement("li");
      item.className = "comment";
      var head = document.createElement("div");
      head.className = "comment-head";
      var name = document.createElement("strong");
      name.textContent = String(comment.author || "Reader");
      var time = document.createElement("time");
      time.dateTime = String(comment.createdAt || comment.created_at || "");
      time.textContent = Blog.formatDate(time.dateTime);
      head.append(name, time);
      var body = document.createElement("p");
      body.textContent = String(comment.body || "");
      item.append(head, body);
      list.appendChild(item);
    });
    none.hidden = Boolean((comments || []).length);
  }

  function setupInteractions(post, comments) {
    var actions = document.getElementById("article-actions");
    var commentsSection = document.getElementById("comments");
    var like = document.getElementById("like-button");
    var likeLabel = document.getElementById("like-label");
    var likeCount = document.getElementById("like-count");
    var share = document.getElementById("share-button");
    var shareLabel = document.getElementById("share-label");
    var form = document.getElementById("comment-form");
    var status = document.getElementById("comment-status");
    var submit = form.querySelector('[type="submit"]');

    actions.hidden = false;
    commentsSection.hidden = false;
    likeCount.textContent = post.likeCount;
    var locallyLiked = Blog.hasLocalLike(post.slug);
    like.setAttribute("aria-pressed", locallyLiked ? "true" : "false");
    likeLabel.textContent = locallyLiked ? "Liked" : "Like";
    renderComments(comments);

    like.addEventListener("click", function () {
      like.disabled = true;
      Blog.postJSON({ action: "toggleLike", slug: post.slug, visitorId: Blog.getVisitorId() })
        .then(function (data) {
          Blog.setLocalLike(post.slug, Boolean(data.liked));
          like.setAttribute("aria-pressed", data.liked ? "true" : "false");
          likeLabel.textContent = data.liked ? "Liked" : "Like";
          likeCount.textContent = Math.max(0, Number(data.likeCount || 0));
        })
        .catch(function (error) {
          document.getElementById("action-note").textContent = error.message;
        })
        .finally(function () { like.disabled = false; });
    });

    share.addEventListener("click", function () {
      var shareData = { title: post.title, text: post.excerpt, url: window.location.href };
      if (navigator.share) {
        navigator.share(shareData).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href).then(function () {
          shareLabel.textContent = "Copied";
          window.setTimeout(function () { shareLabel.textContent = "Share"; }, 1800);
        });
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = new FormData(form);
      submit.disabled = true;
      submit.textContent = "Sending…";
      status.hidden = true;

      Blog.postJSON({
        action: "comment",
        slug: post.slug,
        author: String(data.get("name") || ""),
        body: String(data.get("body") || ""),
        company: String(data.get("company") || ""),
        visitorId: Blog.getVisitorId()
      }).then(function () {
        form.reset();
        status.dataset.state = "success";
        status.textContent = "Thanks — your comment has been received.";
        status.hidden = false;
        status.focus();
      }).catch(function (error) {
        status.dataset.state = "error";
        status.textContent = error.message;
        status.hidden = false;
        status.focus();
      }).finally(function () {
        submit.disabled = false;
        submit.textContent = "Send";
      });
    });
  }

  function render(post, comments) {
    currentPost = Blog.normalizePost(post);
    post = currentPost;
    loading.hidden = true;
    errorBox.hidden = true;
    article.hidden = false;
    updateMeta(post);

    document.getElementById("article-category").textContent = post.category;
    document.getElementById("article-title").textContent = post.title;
    document.getElementById("article-excerpt").textContent = post.excerpt;
    document.getElementById("article-date").textContent = Blog.formatDate(post.publishedAt);
    document.getElementById("article-reading-time").textContent = post.readingTime + " min read";

    var cover = document.getElementById("article-cover");
    var image = document.getElementById("article-image");
    var imageUrl = Blog.safeImageUrl(post.coverImage);
    if (imageUrl) {
      image.src = imageUrl;
      image.alt = "Cover image for “" + post.title + "”";
      cover.hidden = false;
      image.addEventListener("error", function () { cover.hidden = true; }, { once: true });
    } else {
      cover.hidden = true;
    }

    if (post.externalUrl) {
      document.getElementById("article-body").hidden = true;
      document.getElementById("external-article").hidden = false;
      document.getElementById("external-link").href = post.externalUrl;
      return;
    }

    var body = document.getElementById("article-body");
    body.hidden = false;
    Blog.renderMarkdown(body, post.content || "This note is being prepared. Please check back soon.");
    if (Blog.isConnected()) setupInteractions(post, comments || []);
  }

  if (!slug || !/^[a-z0-9][a-z0-9-]{1,119}$/.test(slug)) {
    showError("The article address is missing or invalid.");
    return;
  }

  if (Blog.isConnected()) {
    Blog.getJSON({ action: "post", slug: slug })
      .then(function (data) { render(data.post, data.comments || []); })
      .catch(function (error) {
        var fallback = (window.HENRY_BLOG_FALLBACK_POSTS || []).map(Blog.normalizePost).find(function (post) {
          return post.slug === slug;
        });
        if (fallback) render(fallback, []);
        else showError(error.message);
      });
  } else {
    var fallback = (window.HENRY_BLOG_FALLBACK_POSTS || []).map(Blog.normalizePost).find(function (post) {
      return post.slug === slug;
    });
    if (fallback) render(fallback, []);
    else showError("This note is not in the local archive, and the Google Sheet has not been connected yet.");
  }
})();
