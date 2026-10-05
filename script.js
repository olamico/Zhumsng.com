// ---------- Supabase connection (keys live in config.js) ----------
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Product data (loaded from the database) ----------
let products = [];

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const imgList = (p) => (p.images && p.images.length ? p.images : p.image ? [{ url: p.image, color: "" }] : []);
const imgTag = (i, p) => (i ? `<img src="${esc(i.url)}" alt="${esc(p.name)}">` : "🛍️");
const productImage = (p) => imgTag(imgList(p)[0], p);
const variantImage = (p, color) => {
  const all = imgList(p);
  return imgTag(all.find((i) => color && i.color === color) || all[0], p);
};

// ---------- State ----------
let cart = loadCart();
let activeCategory = "All";
let searchTerm = "";

// ---------- DOM references ----------
const grid = document.getElementById("productGrid");
const noResults = document.getElementById("noResults");
const filtersEl = document.getElementById("filters");
const searchInput = document.getElementById("search");
const cartEl = document.getElementById("cart");
const cartItemsEl = document.getElementById("cartItems");
const cartCountEl = document.getElementById("cartCount");
const cartTotalEl = document.getElementById("cartTotal");
const overlay = document.getElementById("overlay");
const modal = document.getElementById("checkoutModal");
const form = document.getElementById("checkoutForm");
const formError = document.getElementById("formError");
const toast = document.getElementById("toast");
const detailEl = document.getElementById("detail");

// ---------- Helpers ----------
const formatPrice = (n) => "₦" + n.toLocaleString("en-NG");

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("minishop-cart")) || [];
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem("Zhumsng-cart", JSON.stringify(cart));
  } catch (err) {
    /* storage unavailable: cart stays in memory */
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ---------- Rendering: filters & products ----------
function renderFilters() {
  const categories = ["All", ...new Set(products.map((p) => p.category))];
  filtersEl.innerHTML = categories
    .map((c) => `<button class="filter-btn ${c === activeCategory ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
}

function renderProducts() {
  const list = products.filter((p) => {
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  grid.innerHTML = list
    .map(
      (p) => `
      <article class="card" data-open="${p.id}">
        <div class="card-img">${productImage(p)}</div>
        <div class="card-body">
          <span class="card-cat">${esc(p.category)}</span>
          <h3 class="card-title">${esc(p.name)}</h3>
          <p class="card-desc">${esc(p.description)}</p>
          <span class="card-price">${formatPrice(p.price)}</span>
          <button class="btn" data-open="${p.id}">Choose Options</button>
        </div>
      </article>`
    )
    .join("");

  noResults.hidden = list.length > 0;
}

// ---------- Cart logic ----------
const keyOf = (id, color, size) => [id, color || "", size || ""].join("|");
const findProduct = (id) => products.find((p) => p.id === id);

function addToCart(id, color, size) {
  const key = keyOf(id, color, size);
  const item = cart.find((i) => i.key === key);
  if (item) item.qty += 1;
  else cart.push({ key, id, color: color || "", size: size || "", qty: 1 });
  saveCart();
  renderCart();
  showToast("Added to cart");
}

function changeQty(key, delta) {
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((i) => i.key !== key);
  saveCart();
  renderCart();
}

function removeItem(key) {
  cart = cart.filter((i) => i.key !== key);
  saveCart();
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, i) => sum + findProduct(i.id).price * i.qty, 0);
}

function renderCart() {
  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<p class="empty">Your cart is empty.</p>';
  } else {
    cartItemsEl.innerHTML = cart
      .map((i) => {
        const p = findProduct(i.id);
        const variant = [i.color, i.size].filter(Boolean).join(" · ");
        return `
        <div class="cart-item">
          <div class="cart-item-icon">${variantImage(p, i.color)}</div>
          <div class="cart-item-info">
            <h4>${esc(p.name)}</h4>
            ${variant ? `<span>${esc(variant)}</span><br>` : ""}
            <span>${formatPrice(p.price)}</span>
            <div class="qty">
              <button data-dec="${esc(i.key)}">−</button>
              <span>${i.qty}</span>
              <button data-inc="${esc(i.key)}">+</button>
              <button class="remove" data-remove="${esc(i.key)}" aria-label="Remove">🗑</button>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }
  cartCountEl.textContent = cart.reduce((n, i) => n + i.qty, 0);
  cartTotalEl.textContent = formatPrice(cartTotal());
}

function openCart() {
  cartEl.classList.add("open");
  overlay.classList.add("show");
}

function closeCart() {
  cartEl.classList.remove("open");
  overlay.classList.remove("show");
}

// ---------- Checkout ----------
function openCheckout() {
  if (cart.length === 0) {
    showToast("Your cart is empty");
    return;
  }
  closeCart();
  formError.textContent = "";
  modal.classList.add("show");
}

function closeCheckout() {
  modal.classList.remove("show");
}

function buildOrderMessage(customer, order) {
  const lines = order.items.map((i, idx) => `${idx + 1}. ${i.name}${i.color || i.size ? ` (${[i.color, i.size].filter(Boolean).join(", ")})` : ""} x${i.qty} - ${formatPrice(i.price * i.qty)}`);
  return [
    `*New Order #${order.id} - Zhumsng*`,
    "",
    `Name: ${customer.name}`,
    `Phone: ${customer.phone}`,
    `Email: ${customer.email}`,
    `Address: ${customer.address}`,
    "",
    "*Items*",
    ...lines,
    "",
    `*Total: ${formatPrice(order.total)}*`
  ].join("\n");
}

async function handleCheckout(e) {
  e.preventDefault();
  const customer = {
    name: document.getElementById("name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
    address: document.getElementById("address").value.trim()
  };

  if (!customer.name || !customer.phone || !customer.email || !customer.address) {
    formError.textContent = "Please fill in all fields.";
    return;
  }
  if (!/^\d{7,15}$/.test(customer.phone.replace(/[\s+\-()]/g, ""))) {
    formError.textContent = "Please enter a valid phone number.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    formError.textContent = "Please enter a valid email address.";
    return;
  }

  const submitBtn = form.querySelector("[type=submit]");
  submitBtn.disabled = true;
  formError.textContent = "";

  try {
    // 1. Save the order in Supabase (the database calculates the real total)
    const { data: order, error } = await sb.rpc("place_order", {
      p_name: customer.name,
      p_phone: customer.phone,
      p_email: customer.email,
      p_address: customer.address,
      p_items: cart.map((i) => ({ id: i.id, qty: i.qty, color: i.color, size: i.size }))
    });
    if (error) throw new Error(error.message || "Could not place the order");

    // 2. Send the order to WhatsApp
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildOrderMessage(customer, order))}`;
    const win = window.open(url, "_blank");
    if (!win) window.location.href = url; // fallback if the pop-up is blocked

    cart = [];
    saveCart();
    renderCart();
    form.reset();
    closeCheckout();
    showToast(`Thanks ${customer.name.split(" ")[0]}! Complete your order in WhatsApp.`);
  } catch (err) {
    formError.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- Single product page (#p=ID) ----------
let current = null;
let sel = { color: "", size: "" };

const galleryFor = (p) => {
  const all = imgList(p);
  const byColor = sel.color ? all.filter((i) => i.color === sel.color) : [];
  return byColor.length ? byColor : all;
};

function route() {
  const m = location.hash.match(/^#p=(\d+)$/);
  current = m ? findProduct(Number(m[1])) : null;
  document.getElementById("listView").hidden = !!current;
  detailEl.hidden = !current;
  if (current) {
    sel = { color: "", size: "" };
    renderDetail();
    window.scrollTo(0, 0);
  } else {
    // menu links like #shop, #about, #contact (also works when coming back from a product page)
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }
}

function chips(label, list, attr, chosen) {
  if (!list || !list.length) return "";
  return `<div class="opt"><h4>${label}: <span>${esc(chosen || "Select one")}</span></h4><div class="chips">${list
    .map((v) => `<button class="chip ${v === chosen ? "on" : ""}" data-${attr}="${esc(v)}">${esc(v)}</button>`)
    .join("")}</div></div>`;
}

function renderDetail() {
  const p = current;
  const imgs = galleryFor(p);
  detailEl.innerHTML = `
    <button class="back" data-back>← Back to shop</button>
    <div class="detail-grid">
      <div class="gallery">
        <div class="gallery-main" id="mainImg">${imgTag(imgs[0], p)}</div>
        ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((i, n) => `<img src="${esc(i.url)}" data-thumb="${n}" class="${n === 0 ? "on" : ""}" alt="">`).join("")}</div>` : ""}
      </div>
      <div class="info">
        <span class="card-cat">${esc(p.category)}</span>
        <h2>${esc(p.name)}</h2>
        <p class="card-price">${formatPrice(p.price)}</p>
        <p class="card-desc">${esc(p.description)}</p>
        ${chips("Colour", p.colors, "color", sel.color)}
        ${chips("Size", p.sizes, "size", sel.size)}
        <button class="btn" data-addvariant>Add to Cart</button>
      </div>
    </div>`;
}

detailEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-back]")) {
    location.hash = "";
    return;
  }
  const color = e.target.closest("[data-color]");
  const size = e.target.closest("[data-size]");
  const thumb = e.target.closest("[data-thumb]");
  if (color) {
    sel.color = sel.color === color.dataset.color ? "" : color.dataset.color;
    renderDetail();
  } else if (size) {
    sel.size = sel.size === size.dataset.size ? "" : size.dataset.size;
    renderDetail();
  } else if (thumb) {
    const img = galleryFor(current)[Number(thumb.dataset.thumb)];
    document.getElementById("mainImg").innerHTML = imgTag(img, current);
    detailEl.querySelectorAll(".thumbs img").forEach((t) => t.classList.toggle("on", t === thumb));
  } else if (e.target.closest("[data-addvariant]")) {
    if (current.colors && current.colors.length && !sel.color) return showToast("Please choose a colour");
    if (current.sizes && current.sizes.length && !sel.size) return showToast("Please choose a size");
    addToCart(current.id, sel.color, sel.size);
  }
});

window.addEventListener("hashchange", route);

// ---------- Event listeners ----------
filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  renderFilters();
  renderProducts();
});

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderProducts();
});

grid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-open]");
  if (card) location.hash = "p=" + card.dataset.open;
});

cartItemsEl.addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  const rem = e.target.closest("[data-remove]");
  if (inc) changeQty(inc.dataset.inc, 1);
  if (dec) changeQty(dec.dataset.dec, -1);
  if (rem) removeItem(rem.dataset.remove);
});

document.getElementById("cartBtn").addEventListener("click", openCart);
document.getElementById("closeCart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
document.getElementById("checkoutBtn").addEventListener("click", openCheckout);
document.getElementById("cancelCheckout").addEventListener("click", closeCheckout);
form.addEventListener("submit", handleCheckout);

// ---------- Hamburger menu ----------
const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const menuBtn = document.getElementById("menuBtn");

function setMenu(open) {
  drawer.classList.toggle("open", open);
  drawerBackdrop.classList.toggle("show", open);
  menuBtn.setAttribute("aria-expanded", open);
}
menuBtn.addEventListener("click", () => setMenu(true));
document.getElementById("drawerClose").addEventListener("click", () => setMenu(false));
drawerBackdrop.addEventListener("click", () => setMenu(false));
drawer.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

// ---------- Hero slider ----------
const slides = [...document.querySelectorAll(".slide")];
const dotBtns = [...document.querySelectorAll("#dots button")];
let slideNo = 0;
let slideTimer;

function showSlide(n) {
  slideNo = (n + slides.length) % slides.length;
  slides.forEach((s, i) => s.classList.toggle("on", i === slideNo));
  dotBtns.forEach((d, i) => d.classList.toggle("on", i === slideNo));
}
function startSlider() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => showSlide(slideNo + 1), 5000);
}
dotBtns.forEach((d, i) => d.addEventListener("click", () => { showSlide(i); startSlider(); }));

let touchX = null;
const heroEl = document.getElementById("home");
heroEl.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
heroEl.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) { showSlide(slideNo + (dx < 0 ? 1 : -1)); startSlider(); }
  touchX = null;
});
startSlider();

// ---------- Init ----------
async function init() {
  try {
    const { data, error } = await sb.from("products").select("*").order("id", { ascending: false });
    if (error) throw error;
    products = data;
  } catch (err) {
    grid.innerHTML = '<p class="empty">Could not load products. Check your internet and the keys in config.js.</p>';
  }
  // drop cart items for products the admin has since deleted
  cart = cart.filter((i) => i.key && findProduct(i.id));
  saveCart();
  renderFilters();
  renderProducts();
  renderCart();
  route();
}
init();
