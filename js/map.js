/* =========================================================
   4057 — map of local e-waste solutions
   Add a business: add an entry here and a matching
   <button class="marker" data-biz="..."> in map.html.
   ========================================================= */
const BUSINESSES = {
  "computer-recyclers": {
    name: "Computer Recyclers",
    address: "17B Amber Crescent, Judea, Tauranga 3110",
    hours: "Monday - Friday 9:00am - 5:00pm",
    overview: "Computer Recyclers is a locally owned business in Judea, Tauranga. For the past 24 years that they have been open, Computer Recyclers have worked closely with businesses and individuals in the community in order to help minimise the footprint e-waste is having on our environment and want the best outcomes for you and the environment.",
    services: ["E-waste Drop Offs", "E-waste Pick Ups", "Data Destruction", "New and Used Laptop and PC's", "New and Used Laptop and PC Parts", "Laptop and PC Repairs", "Networking"],
    url: "", // TODO: paste their website address here
  },
  econox: {
    name: "Econox",
    address: "Unit 3/20 Kaweroa Drive, Omanawa 3110",
    hours: "Mon, Wed, Fri 9:00am - 4:00pm Sat 9:00am - 1:00pm",
    overview: "Econox is a locally owned and operated company in Omanawa, Tauranga. They are the leading polystyrene recyclers in Tauranga and the Western Bay of Plenty but are also involved in recycling e-waste. At Econox, they are passionate about building a sustainable future for New Zealand and strive to champion circular recycling and divert valuable resources from ending up in landfills.",
    services: ["E-waste Management", "Data Deconstruction", "Polystyrene Recycling"],
    url: "", // TODO: paste their website address here
  },
};

(() => {
  const page = document.getElementById("map");
  const panel = document.getElementById("panel");
  const markers = page.querySelectorAll(".marker");

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function show(id) {
    const b = BUSINESSES[id];
    if (!b) return;
    // Until a website is added, Visit searches for the business instead.
    const href = b.url || `https://www.google.com/search?q=${encodeURIComponent(b.name + " Tauranga")}`;
    panel.innerHTML = `
      <article class="biz panel-fade">
        <button class="biz-close" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20"/></svg>
        </button>
        <h2 class="title">${esc(b.name)}</h2>
        <p class="biz-meta">Address: ${esc(b.address)}<br>Hours: ${esc(b.hours)}</p>
        <h3>Overview</h3>
        <p>${esc(b.overview)}</p>
        <h3>Services</h3>
        <div class="biz-services">
          <ul>${b.services.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
          <a class="btn" href="${esc(href)}" target="_blank" rel="noopener">Visit</a>
        </div>
      </article>`;
    panel.hidden = false;
    panel.querySelector(".biz-close").addEventListener("click", reset);
    page.classList.add("has-selection");
    markers.forEach((m) => m.classList.toggle("is-active", m.dataset.biz === id));
  }

  function reset() {
    panel.hidden = true;
    panel.innerHTML = "";
    page.classList.remove("has-selection");
    markers.forEach((m) => m.classList.remove("is-active"));
  }

  markers.forEach((m) => m.addEventListener("click", (e) => { e.stopPropagation(); show(m.dataset.biz); }));
  page.querySelector(".map-art").addEventListener("click", reset);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") reset(); });
})();
