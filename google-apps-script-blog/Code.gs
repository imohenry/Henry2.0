const POSTS_SHEET = "Posts";
const COMMENTS_SHEET = "Comments";
const LIKES_SHEET = "Likes";

const POST_HEADERS = [
  "slug",
  "title",
  "excerpt",
  "content",
  "category",
  "cover_image",
  "published_at",
  "reading_time",
  "featured",
  "status",
  "external_url",
];
const COMMENT_HEADERS = [
  "id",
  "post_slug",
  "author",
  "body",
  "created_at",
  "status",
  "visitor_hash",
];
const LIKE_HEADERS = ["post_slug", "visitor_hash", "created_at"];
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,119}$/;
const VISITOR_PATTERN = /^[a-zA-Z0-9_-]{20,120}$/;

/**
 * Run once from a spreadsheet-bound Apps Script project. This creates the
 * database tabs, stores the spreadsheet ID, and adds Henry's existing Medium
 * archive when the Posts tab is empty.
 */
function setupHenryBlog() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Open Apps Script from the blog spreadsheet first.");
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("HENRY_BLOG_SPREADSHEET_ID", spreadsheet.getId());
  if (!properties.getProperty("HENRY_BLOG_HASH_SALT")) {
    properties.setProperty(
      "HENRY_BLOG_HASH_SALT",
      Utilities.getUuid() + Utilities.getUuid(),
    );
  }

  ensureSchema_(spreadsheet, true);
  seedArchive_(spreadsheet);
  SpreadsheetApp.flush();
  return `Henry's blog database is ready: ${spreadsheet.getUrl()}`;
}

/** Public reads: a post list or one published post with approved comments. */
function doGet(event) {
  try {
    const spreadsheet = openBlogSpreadsheet_();
    ensureSchema_(spreadsheet, false);
    const action = cleanString_(event?.parameter?.action || "list", 20);

    if (action === "list") {
      return jsonResponse_({ ok: true, posts: listPublicPosts_(spreadsheet) });
    }
    if (action === "post") {
      const slug = cleanSlug_(event?.parameter?.slug);
      const post = findPublishedPost_(spreadsheet, slug);
      if (!post) throw appError_(404, "That post could not be found.");
      return jsonResponse_({
        ok: true,
        post: addCounts_(spreadsheet, post),
        comments: listApprovedComments_(spreadsheet, slug),
      });
    }
    throw appError_(400, "Unknown action.");
  } catch (error) {
    return errorResponse_(error);
  }
}

/** Public writes are deliberately limited to toggling a like or queuing a comment. */
function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const spreadsheet = openBlogSpreadsheet_();
    ensureSchema_(spreadsheet, false);
    const action = cleanString_(payload.action, 30);

    if (action === "toggleLike") {
      return toggleLike_(spreadsheet, payload);
    }
    if (action === "comment") {
      return addComment_(spreadsheet, payload);
    }
    if (action === "adminData") {
      verifyAdminSecret_(payload.secret);
      return adminData_(spreadsheet);
    }
    if (action === "adminSavePost") {
      verifyAdminSecret_(payload.secret);
      return saveAdminPost_(spreadsheet, payload);
    }
    if (action === "adminDeletePost") {
      verifyAdminSecret_(payload.secret);
      return deleteAdminPost_(spreadsheet, payload);
    }
    if (action === "adminModerateComment") {
      verifyAdminSecret_(payload.secret);
      return moderateAdminComment_(spreadsheet, payload);
    }
    throw appError_(400, "Unknown action.");
  } catch (error) {
    return errorResponse_(error);
  }
}

function openBlogSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(
    "HENRY_BLOG_SPREADSHEET_ID",
  );
  if (!id) {
    throw appError_(
      503,
      "Run setupHenryBlog from the Apps Script editor first.",
    );
  }
  return SpreadsheetApp.openById(id);
}

function ensureSchema_(spreadsheet, applyFormatting) {
  const posts = ensureSheet_(spreadsheet, POSTS_SHEET, POST_HEADERS);
  const comments = ensureSheet_(spreadsheet, COMMENTS_SHEET, COMMENT_HEADERS);
  const likes = ensureSheet_(spreadsheet, LIKES_SHEET, LIKE_HEADERS);

  if (applyFormatting) {
    posts.getRange("A:A").setNumberFormat("@");
    posts.getRange("D:D").setWrap(true);
    comments.getRange("A:D").setNumberFormat("@");
    comments.getRange("D:D").setWrap(true);
    likes.getRange("A:B").setNumberFormat("@");
  }
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  let initialized = false;
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    initialized = true;
  }

  const current = sheet
    .getRange(1, 1, 1, headers.length)
    .getDisplayValues()[0];
  const matches = headers.every((header, index) => current[index] === header);
  if (!matches) {
    if (sheet.getLastRow() > 1) {
      throw appError_(
        409,
        `${name} has unexpected headers. Restore row 1 before continuing.`,
      );
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    initialized = true;
  }
  if (initialized) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sheet;
}

function seedArchive_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(POSTS_SHEET);
  if (sheet.getLastRow() > 1) return;

  const rows = [
    [
      "navigating-the-dark-waters-of-depression",
      "Navigating the dark waters of depression",
      "A clear-eyed look at depression, the stigma around it, and practical ways to find support.",
      "",
      "Life & wellbeing",
      "images/portfolio/Depression-front.jpg",
      "2023-04-12",
      6,
      true,
      "published",
      "https://medium.com/@henryimoh2/navigating-the-dark-waters-of-depression-breaking-the-stigma-2b8fb632a875",
    ],
    [
      "living-with-adhd-as-an-adult",
      "Living with ADHD as an adult",
      "The everyday shape of adult ADHD, why routine tasks can feel unusually hard, and ways to cope.",
      "",
      "Life & wellbeing",
      "images/portfolio/ADHD-front.jpg",
      "2023-03-18",
      7,
      false,
      "published",
      "https://medium.com/@henryimoh2/living-with-adhd-as-an-adult-f5fc093e1d5d",
    ],
    [
      "having-a-bad-day",
      "Having a bad day?",
      "One rough day can feel like the whole story. It is not — and it does not have to become one.",
      "",
      "Personal notes",
      "images/portfolio/Bad-day-front.jpg",
      "2022-11-09",
      4,
      false,
      "published",
      "https://medium.com/@henryimoh2/have-a-bad-day-3c4ae698cb1e",
    ],
    [
      "absence-seizure-all-you-need-to-know",
      "Absence seizures: all you need to know",
      "A practical introduction to absence seizures, their signs, causes, diagnosis, and treatment.",
      "",
      "Health",
      "images/portfolio/ABS-front.jpg",
      "2022-08-20",
      8,
      false,
      "published",
      "https://medium.com/@henryimoh2/absence-seizure-all-you-need-to-know-f38acbc065d2",
    ],
    [
      "insomnia-a-sleep-disorder-or-a-slow-death",
      "Insomnia: a sleep disorder or a slow death?",
      "What insomnia does to the body, why restful sleep matters, and when sleeplessness needs attention.",
      "",
      "Health",
      "images/portfolio/Insomnia-front.jpg",
      "2022-05-14",
      7,
      false,
      "published",
      "https://medium.com/@henryimoh2/insomnia-a-mental-disorder-or-a-slow-death-a4257fc405e4",
    ],
  ];
  sheet.getRange(2, 1, rows.length, POST_HEADERS.length).setValues(rows);
}

function listPublicPosts_(spreadsheet) {
  const countMaps = countMaps_(spreadsheet);
  return readPosts_(spreadsheet)
    .filter((post) => post.status === "published")
    .map((post) => publicPost_(post, false, countMaps))
    .sort((left, right) => {
      if (left.featured !== right.featured) return left.featured ? -1 : 1;
      return right.publishedAt.localeCompare(left.publishedAt);
    });
}

function findPublishedPost_(spreadsheet, slug) {
  return (
    readPosts_(spreadsheet).find(
      (post) => post.slug === slug && post.status === "published",
    ) || null
  );
}

function readPosts_(spreadsheet) {
  const rows = dataRows_(
    spreadsheet.getSheetByName(POSTS_SHEET),
    POST_HEADERS.length,
  );
  return rows
    .map((row) => ({
      slug: cleanSlugOrEmpty_(row[0]),
      title: unprotectSheetText_(row[1], 180),
      excerpt: unprotectSheetText_(row[2], 500),
      content: unprotectSheetText_(row[3], 100000),
      category: unprotectSheetText_(row[4], 80) || "Notes",
      coverImage: safeAssetUrl_(row[5]),
      publishedAt: dateString_(row[6]),
      readingTime: cleanPositiveInteger_(row[7], 1, 120),
      featured: row[8] === true || String(row[8]).toLowerCase() === "true",
      status: cleanString_(row[9], 20).toLowerCase(),
      externalUrl: safeExternalUrl_(row[10]),
    }))
    .filter((post) => post.slug && post.title);
}

function publicPost_(post, includeContent, countMaps) {
  const result = {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    coverImage: post.coverImage,
    publishedAt: post.publishedAt,
    readingTime:
      post.readingTime || Math.max(1, Math.ceil(wordCount_(post.content) / 220)),
    featured: post.featured,
    externalUrl: post.externalUrl,
    likeCount: countMaps?.likes?.[post.slug] || 0,
    commentCount: countMaps?.comments?.[post.slug] || 0,
  };
  if (includeContent) result.content = post.content;
  return result;
}

function addCounts_(spreadsheet, post) {
  return publicPost_(post, true, countMaps_(spreadsheet));
}

function countMaps_(spreadsheet) {
  const likes = {};
  dataRows_(spreadsheet.getSheetByName(LIKES_SHEET), LIKE_HEADERS.length).forEach(
    (row) => {
      const slug = cleanSlugOrEmpty_(row[0]);
      if (slug) likes[slug] = (likes[slug] || 0) + 1;
    },
  );

  const comments = {};
  dataRows_(
    spreadsheet.getSheetByName(COMMENTS_SHEET),
    COMMENT_HEADERS.length,
  ).forEach((row) => {
    const slug = cleanSlugOrEmpty_(row[1]);
    const status = cleanString_(row[5], 20).toLowerCase();
    if (slug && status === "approved") {
      comments[slug] = (comments[slug] || 0) + 1;
    }
  });
  return { likes, comments };
}

function listApprovedComments_(spreadsheet, slug) {
  return dataRows_(
    spreadsheet.getSheetByName(COMMENTS_SHEET),
    COMMENT_HEADERS.length,
  )
    .filter(
      (row) =>
        cleanSlugOrEmpty_(row[1]) === slug &&
        cleanString_(row[5], 20).toLowerCase() === "approved",
    )
    .map((row) => ({
      id: cleanString_(row[0], 100),
      author: unprotectSheetText_(row[2], 80),
      body: unprotectSheetText_(row[3], 2500),
      createdAt: isoDate_(row[4]),
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function adminData_(spreadsheet) {
  const countMaps = countMaps_(spreadsheet);
  const posts = readPosts_(spreadsheet)
    .map((post) => ({
      ...publicPost_(post, true, countMaps),
      status: post.status === "published" ? "published" : "draft",
    }))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  const comments = dataRows_(
    spreadsheet.getSheetByName(COMMENTS_SHEET),
    COMMENT_HEADERS.length,
  )
    .map((row) => ({
      id: cleanString_(row[0], 100),
      postSlug: cleanSlugOrEmpty_(row[1]),
      author: unprotectSheetText_(row[2], 80),
      body: unprotectSheetText_(row[3], 2500),
      createdAt: isoDate_(row[4]),
      status: cleanCommentStatus_(row[5]),
    }))
    .filter((comment) => comment.id && comment.postSlug)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return jsonResponse_({ ok: true, posts, comments });
}

function saveAdminPost_(spreadsheet, payload) {
  const post = normalizeAdminPost_(payload.post);
  const originalSlug = cleanSlugOrEmpty_(payload.originalSlug);
  const sheet = spreadsheet.getSheetByName(POSTS_SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = dataRows_(sheet, POST_HEADERS.length);
    const originalIndex = originalSlug
      ? rows.findIndex((row) => cleanSlugOrEmpty_(row[0]) === originalSlug)
      : -1;
    if (originalSlug && originalIndex < 0) {
      throw appError_(404, "That post no longer exists. Refresh the admin panel.");
    }

    const duplicateIndex = rows.findIndex(
      (row, index) =>
        cleanSlugOrEmpty_(row[0]) === post.slug && index !== originalIndex,
    );
    if (duplicateIndex >= 0) {
      throw appError_(409, "Another post already uses that slug.");
    }

    if (post.featured) {
      rows.forEach((row, index) => {
        if (index !== originalIndex && row[8] === true) {
          sheet.getRange(index + 2, 9).setValue(false);
        }
      });
    }

    const values = adminPostRow_(post);
    if (originalIndex >= 0) {
      sheet
        .getRange(originalIndex + 2, 1, 1, POST_HEADERS.length)
        .setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    if (originalSlug && originalSlug !== post.slug) {
      replaceSlug_(
        spreadsheet.getSheetByName(COMMENTS_SHEET),
        2,
        originalSlug,
        post.slug,
      );
      replaceSlug_(
        spreadsheet.getSheetByName(LIKES_SHEET),
        1,
        originalSlug,
        post.slug,
      );
    }
    SpreadsheetApp.flush();
    return jsonResponse_({ ok: true, post: addCounts_(spreadsheet, post) });
  } finally {
    lock.releaseLock();
  }
}

function deleteAdminPost_(spreadsheet, payload) {
  const slug = cleanSlug_(payload.slug);
  const postSheet = spreadsheet.getSheetByName(POSTS_SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = dataRows_(postSheet, POST_HEADERS.length);
    const index = rows.findIndex(
      (row) => cleanSlugOrEmpty_(row[0]) === slug,
    );
    if (index < 0) throw appError_(404, "That post could not be found.");

    deleteRowsByValue_(
      spreadsheet.getSheetByName(COMMENTS_SHEET),
      COMMENT_HEADERS.length,
      2,
      slug,
    );
    deleteRowsByValue_(
      spreadsheet.getSheetByName(LIKES_SHEET),
      LIKE_HEADERS.length,
      1,
      slug,
    );
    postSheet.deleteRow(index + 2);
    SpreadsheetApp.flush();
    return jsonResponse_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function moderateAdminComment_(spreadsheet, payload) {
  const id = cleanString_(payload.id, 100);
  const status = cleanString_(payload.status, 20).toLowerCase();
  if (!id) throw appError_(400, "A comment ID is required.");
  if (!/^(pending|approved|rejected)$/.test(status)) {
    throw appError_(400, "Choose a valid moderation status.");
  }

  const sheet = spreadsheet.getSheetByName(COMMENTS_SHEET);
  const rows = dataRows_(sheet, COMMENT_HEADERS.length);
  const index = rows.findIndex((row) => cleanString_(row[0], 100) === id);
  if (index < 0) throw appError_(404, "That comment could not be found.");
  sheet.getRange(index + 2, 6).setValue(status);
  SpreadsheetApp.flush();
  return jsonResponse_({ ok: true, id, status });
}

function normalizeAdminPost_(rawPost) {
  const raw = rawPost && typeof rawPost === "object" ? rawPost : {};
  const slug = cleanSlug_(raw.slug);
  const title = cleanString_(raw.title, 180);
  const excerpt = cleanString_(raw.excerpt, 500);
  const content = cleanString_(raw.content, 100000);
  const category = cleanString_(raw.category, 80) || "Notes";
  const coverInput = cleanString_(raw.coverImage, 1000);
  const coverImage = safeAssetUrl_(coverInput);
  const externalInput = cleanString_(raw.externalUrl, 1000);
  const externalUrl = safeExternalUrl_(externalInput);
  const status = raw.status === "published" ? "published" : "draft";
  const publishedAt = dateString_(raw.publishedAt) || todayString_();

  if (!title) throw appError_(400, "Add a title before saving.");
  if (!excerpt) throw appError_(400, "Add a short excerpt before saving.");
  if (coverInput && !coverImage) {
    throw appError_(400, "The cover image must use HTTPS or a local images path.");
  }
  if (externalInput && !externalUrl) {
    throw appError_(400, "The external article URL must use HTTPS.");
  }
  if (status === "published" && !externalUrl && !content) {
    throw appError_(400, "Add article content before publishing.");
  }

  return {
    slug,
    title,
    excerpt,
    content,
    category,
    coverImage,
    publishedAt,
    readingTime: cleanPositiveInteger_(raw.readingTime, 1, 120),
    featured: raw.featured === true,
    status,
    externalUrl,
  };
}

function adminPostRow_(post) {
  return [
    post.slug,
    protectSheetTextWithLimit_(post.title, 180),
    protectSheetTextWithLimit_(post.excerpt, 500),
    protectSheetTextWithLimit_(post.content, 100000),
    protectSheetTextWithLimit_(post.category, 80),
    post.coverImage,
    post.publishedAt,
    post.readingTime,
    post.featured,
    post.status,
    post.externalUrl,
  ];
}

function replaceSlug_(sheet, column, oldSlug, newSlug) {
  const rows = dataRows_(sheet, sheet.getLastColumn());
  rows.forEach((row, index) => {
    if (cleanSlugOrEmpty_(row[column - 1]) === oldSlug) {
      sheet.getRange(index + 2, column).setValue(newSlug);
    }
  });
}

function deleteRowsByValue_(sheet, width, column, value) {
  const rows = dataRows_(sheet, width);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index][column - 1]) === value) sheet.deleteRow(index + 2);
  }
}

function verifyAdminSecret_(providedSecret) {
  const expected = PropertiesService.getScriptProperties().getProperty(
    "HENRY_BLOG_ADMIN_SECRET",
  );
  if (!expected || expected.length < 32) {
    throw appError_(503, "The blog admin secret has not been configured.");
  }
  if (!constantTimeEqual_(String(providedSecret || ""), expected)) {
    throw appError_(401, "Unauthorized.");
  }
}

function constantTimeEqual_(left, right) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^
      (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return mismatch === 0;
}

function cleanCommentStatus_(value) {
  const status = cleanString_(value, 20).toLowerCase();
  return /^(approved|rejected)$/.test(status) ? status : "pending";
}

function toggleLike_(spreadsheet, payload) {
  const slug = cleanSlug_(payload.slug);
  const visitorHash = visitorHash_(payload.visitorId);
  if (!findPublishedPost_(spreadsheet, slug)) {
    throw appError_(404, "That post could not be found.");
  }
  rateLimit_(`like:${visitorHash}:${slug}`, 2);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = spreadsheet.getSheetByName(LIKES_SHEET);
    const rows = dataRows_(sheet, LIKE_HEADERS.length);
    const existing = rows.findIndex(
      (row) =>
        cleanSlugOrEmpty_(row[0]) === slug &&
        cleanString_(row[1], 100) === visitorHash,
    );
    let liked;
    if (existing >= 0) {
      sheet.deleteRow(existing + 2);
      liked = false;
    } else {
      sheet.appendRow([slug, visitorHash, new Date().toISOString()]);
      liked = true;
    }
    SpreadsheetApp.flush();
    const likeCount = dataRows_(sheet, LIKE_HEADERS.length).filter(
      (row) => cleanSlugOrEmpty_(row[0]) === slug,
    ).length;
    return jsonResponse_({ ok: true, liked, likeCount });
  } finally {
    lock.releaseLock();
  }
}

function addComment_(spreadsheet, payload) {
  // Quietly accept honeypot submissions without saving them.
  if (cleanString_(payload.company, 200)) {
    return jsonResponse_({ ok: true, status: "pending" });
  }

  const slug = cleanSlug_(payload.slug);
  const visitorHash = visitorHash_(payload.visitorId);
  const author = cleanString_(payload.author, 80);
  const body = cleanString_(payload.body, 2500);
  if (!author) throw appError_(400, "Please add your name.");
  if (body.length < 2) throw appError_(400, "Please write a longer comment.");
  if (!findPublishedPost_(spreadsheet, slug)) {
    throw appError_(404, "That post could not be found.");
  }
  rateLimit_(`comment:${visitorHash}`, 30);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    spreadsheet.getSheetByName(COMMENTS_SHEET).appendRow([
      Utilities.getUuid(),
      slug,
      protectSheetText_(author),
      protectSheetText_(body),
      new Date().toISOString(),
      "pending",
      visitorHash,
    ]);
    SpreadsheetApp.flush();
    return jsonResponse_({ ok: true, status: "pending" });
  } finally {
    lock.releaseLock();
  }
}

function visitorHash_(rawVisitorId) {
  const visitorId = cleanString_(rawVisitorId, 120);
  if (!VISITOR_PATTERN.test(visitorId)) {
    throw appError_(400, "Your browser could not be identified.");
  }
  const salt = PropertiesService.getScriptProperties().getProperty(
    "HENRY_BLOG_HASH_SALT",
  );
  if (!salt) throw appError_(503, "Run setupHenryBlog again.");
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    visitorId + salt,
    Utilities.Charset.UTF_8,
  )
    .map((byte) => (byte & 255).toString(16).padStart(2, "0"))
    .join("");
}

function rateLimit_(key, seconds) {
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) {
    throw appError_(429, "Please wait a moment before trying that again.");
  }
  cache.put(key, "1", seconds);
}

function dataRows_(sheet, width) {
  const lastRow = sheet.getLastRow();
  return lastRow < 2
    ? []
    : sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function cleanSlug_(value) {
  const slug = cleanSlugOrEmpty_(value);
  if (!slug) throw appError_(400, "A valid post slug is required.");
  return slug;
}

function cleanSlugOrEmpty_(value) {
  const slug = cleanString_(value, 120).toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "";
}

function cleanString_(value, maxLength) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function cleanPositiveInteger_(value, minimum, maximum) {
  const number = Math.round(Number(value));
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : minimum;
}

function wordCount_(value) {
  const text = cleanString_(value, 100000);
  return text ? text.split(/\s+/).length : 0;
}

function protectSheetText_(value) {
  return protectSheetTextWithLimit_(value, 2500);
}

function protectSheetTextWithLimit_(value, maxLength) {
  const text = cleanString_(value, maxLength);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function unprotectSheetText_(value, maxLength) {
  const text = cleanString_(value, maxLength + 1);
  return /^'[=+\-@]/.test(text) ? text.slice(1, maxLength + 1) : text.slice(0, maxLength);
}

function safeExternalUrl_(value) {
  const url = cleanString_(value, 1000);
  return /^https:\/\//i.test(url) ? url : "";
}

function safeAssetUrl_(value) {
  const url = cleanString_(value, 1000);
  return /^(?:https:\/\/|images\/|\.\/images\/)/i.test(url) ? url : "";
}

function dateString_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Africa/Lagos", "yyyy-MM-dd");
  }
  const text = cleanString_(value, 40);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return "";
  const date = new Date(`${match[0]}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[0]
    ? match[0]
    : "";
}

function todayString_() {
  return Utilities.formatDate(new Date(), "Africa/Lagos", "yyyy-MM-dd");
}

function isoDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function appError_(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function errorResponse_(error) {
  console.error(error);
  const status = Number(error?.status) || 500;
  const message =
    status >= 500
      ? "The blog database could not complete that request."
      : cleanString_(error?.message || "Invalid request.", 300);
  return jsonResponse_({ ok: false, status, error: message });
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
