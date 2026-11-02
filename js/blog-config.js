/*
 * Henry's blog configuration.
 *
 * Netlify sends this same-origin path to the blog function, which then talks
 * to Google Apps Script. Keep the Apps Script /exec URL in Netlify's
 * HENRY_BLOG_APPS_SCRIPT_URL environment variable, not in this browser file.
 */
window.HENRY_BLOG_API_URL = "/api/blog";
window.HENRY_BLOG_ADMIN_API_URL = "/api/blog-admin";

/* Existing work keeps the blog useful while the Google Sheet is being set up. */
window.HENRY_BLOG_FALLBACK_POSTS = [
  {
    slug: "navigating-the-dark-waters-of-depression",
    title: "Navigating the dark waters of depression",
    excerpt: "A clear-eyed look at depression, the stigma around it, and practical ways to find support.",
    category: "Life & wellbeing",
    coverImage: "images/portfolio/Depression-front.jpg",
    publishedAt: "2023-04-12",
    readingTime: 6,
    featured: true,
    externalUrl: "https://medium.com/@henryimoh2/navigating-the-dark-waters-of-depression-breaking-the-stigma-2b8fb632a875"
  },
  {
    slug: "living-with-adhd-as-an-adult",
    title: "Living with ADHD as an adult",
    excerpt: "The everyday shape of adult ADHD, why routine tasks can feel unusually hard, and ways to cope.",
    category: "Life & wellbeing",
    coverImage: "images/portfolio/ADHD-front.jpg",
    publishedAt: "2023-03-18",
    readingTime: 7,
    externalUrl: "https://medium.com/@henryimoh2/living-with-adhd-as-an-adult-f5fc093e1d5d"
  },
  {
    slug: "having-a-bad-day",
    title: "Having a bad day?",
    excerpt: "One rough day can feel like the whole story. It is not — and it does not have to become one.",
    category: "Personal notes",
    coverImage: "images/portfolio/Bad-day-front.jpg",
    publishedAt: "2022-11-09",
    readingTime: 4,
    externalUrl: "https://medium.com/@henryimoh2/have-a-bad-day-3c4ae698cb1e"
  },
  {
    slug: "absence-seizure-all-you-need-to-know",
    title: "Absence seizures: all you need to know",
    excerpt: "A practical introduction to absence seizures, their signs, causes, diagnosis, and treatment.",
    category: "Health",
    coverImage: "images/portfolio/ABS-front.jpg",
    publishedAt: "2022-08-20",
    readingTime: 8,
    externalUrl: "https://medium.com/@henryimoh2/absence-seizure-all-you-need-to-know-f38acbc065d2"
  },
  {
    slug: "insomnia-a-sleep-disorder-or-a-slow-death",
    title: "Insomnia: a sleep disorder or a slow death?",
    excerpt: "What insomnia does to the body, why restful sleep matters, and when sleeplessness needs attention.",
    category: "Health",
    coverImage: "images/portfolio/Insomnia-front.jpg",
    publishedAt: "2022-05-14",
    readingTime: 7,
    externalUrl: "https://medium.com/@henryimoh2/insomnia-a-mental-disorder-or-a-slow-death-a4257fc405e4"
  }
];
