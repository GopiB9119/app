"use strict";

const newsFilters = document.querySelector(".news-filters");
const newsStories = [...document.querySelectorAll("[data-news-story]")];
const newsResultCount = document.querySelector("#news-result-count");
const newsEmpty = document.querySelector("#news-empty");

function filterNews(category) {
  let visibleCards = 0;
  newsStories.forEach(story => {
    const visible = category === "all" || story.dataset.newsStory === category;
    story.hidden = !visible;
    if (visible && story.classList.contains("news-page-card")) visibleCards += 1;
  });
  newsFilters.querySelectorAll("[data-news-filter]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.newsFilter === category));
  });
  newsResultCount.textContent = `${visibleCards} ${visibleCards === 1 ? "story" : "stories"}`;
  newsEmpty.hidden = visibleCards !== 0;
}

newsFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-news-filter]");
  if (!button) return;
  filterNews(button.dataset.newsFilter);
});
