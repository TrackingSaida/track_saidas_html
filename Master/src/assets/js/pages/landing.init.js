/*
Template Name: Velzon - Admin & Dashboard Template
Author: Themesbrand
Website: https://Themesbrand.com/
Contact: Themesbrand@gmail.com
File: landing Js File
*/

//  Window scroll sticky class add
function windowScroll() {
    var navbar = document.getElementById("navbar");
    if (navbar) {
        var scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
        if (scrollTop >= 50) {
            navbar.classList.add("is-sticky");
        } else {
            navbar.classList.remove("is-sticky");
        }
        if (scrollTop > 80) {
            navbar.classList.add("navbar-scrolled");
        } else {
            navbar.classList.remove("navbar-scrolled");
        }
    }
}

window.addEventListener('scroll', function (ev) {
    ev.preventDefault();
    windowScroll();
});

// Estrutura operacional – alternar mockup Transportadora / Sub-base
document.querySelectorAll('.switch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.switch-btn').forEach(function (b) {
            b.classList.remove('active');
        });
        document.querySelectorAll('.mockup-content').forEach(function (m) {
            m.classList.remove('active');
        });
        this.classList.add('active');
        var target = document.getElementById(this.getAttribute('data-target'));
        if (target) {
            target.classList.add('active');
        }
    });
});

// Collapse Menu + overlay (oculta conteúdo atrás do menu no mobile)
const navLinks = document.querySelectorAll('.nav-item');
const menuToggle = document.getElementById('navbarSupportedContent');
const navbarToggler = document.querySelector('.navbar-landing .navbar-toggler');
const verticalOverlay = document.querySelector('.layout-wrapper.landing .vertical-overlay');
const layoutWrapper = document.querySelector('.layout-wrapper.landing');
var bsCollapse = '';

function isMobileMenu() {
    return document.documentElement.clientWidth < 992;
}

function syncNavbarShowToCollapse() {
    if (!layoutWrapper || !menuToggle) return;
    var isShow = menuToggle.classList.contains('show');
    if (isShow && isMobileMenu()) {
        layoutWrapper.classList.add('navbar-show');
    } else {
        layoutWrapper.classList.remove('navbar-show');
    }
}

// Forçar menu fechado ao carregar no mobile (evita iniciar aberto)
document.addEventListener("DOMContentLoaded", function () {
    var navbarCollapse = document.getElementById("navbarSupportedContent");
    if (navbarCollapse && window.innerWidth < 992) {
        navbarCollapse.classList.remove("show");
        if (layoutWrapper) layoutWrapper.classList.remove("navbar-show");
    }
});

if (menuToggle && layoutWrapper) {
    menuToggle.addEventListener('show.bs.collapse', function () {
        if (isMobileMenu()) layoutWrapper.classList.add('navbar-show');
    });
    menuToggle.addEventListener('hidden.bs.collapse', function () {
        layoutWrapper.classList.remove('navbar-show');
    });
    var observer = new MutationObserver(function () {
        syncNavbarShowToCollapse();
    });
    observer.observe(menuToggle, { attributes: true, attributeFilter: ['class'] });
}

if (navbarToggler && layoutWrapper) {
    navbarToggler.addEventListener('click', function () {
        if (!isMobileMenu()) return;
        setTimeout(syncNavbarShowToCollapse, 80);
    });
}

if (verticalOverlay && menuToggle) {
    verticalOverlay.addEventListener('click', function () {
        if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
            var c = bootstrap.Collapse.getInstance(menuToggle);
            if (c) c.hide();
        }
        if (layoutWrapper) layoutWrapper.classList.remove('navbar-show');
    });
}

// Fechar menu ao clicar em um link (apenas mobile, uma vez)
var collapseNavLinks = document.querySelectorAll("#navbarSupportedContent .nav-link");
if (collapseNavLinks.length && menuToggle) {
    collapseNavLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            if (window.innerWidth >= 992) return;
            if (menuToggle.classList.contains("show") && typeof bootstrap !== 'undefined') {
                var c = bootstrap.Collapse.getInstance(menuToggle);
                if (c) c.hide(); else new bootstrap.Collapse(menuToggle).hide();
                if (layoutWrapper) layoutWrapper.classList.remove("navbar-show");
            }
        });
    });
}

if (navLinks && menuToggle) {
    window.addEventListener('load', function () {
        window.dispatchEvent(new Event('resize'));
    });
    window.addEventListener('resize', function () {
        var windowSize = document.documentElement.clientWidth;
        bsCollapse = new bootstrap.Collapse(menuToggle, { toggle: false });
        if (windowSize >= 992) {
            if (layoutWrapper) layoutWrapper.classList.remove('navbar-show');
            menuToggle.classList.remove('show');
        }
    });
}

function toggleMenu() {
    if (document.documentElement.clientWidth < 992 && bsCollapse) {
        bsCollapse.toggle();
    } else {
        bsCollapse = '';
    }
}

// trusted-client-slider
var swiper = new Swiper(".trusted-client-slider", {
    spaceBetween: 30,
    loop: 'true',
    slidesPerView: 1,
    autoplay: {
        delay: 1000,
        disableOnInteraction: false,
    },
    breakpoints: {
        576: {
            slidesPerView: 2,
        },
        768: {
            slidesPerView: 3,
        },
        1024: {
            slidesPerView: 4,
        },
    },
});

// pricing
function check() {
    var checkBox = document.getElementById("plan-switch");
    var month = document.getElementsByClassName("month");
    var annual = document.getElementsByClassName("annual");

    var i = 0;
    Array.from(month).forEach(function (mon) {
        if (checkBox.checked == true) {
            annual[i].style.display = "block";
            mon.style.display = "none";
        } else if (checkBox.checked == false) {
            annual[i].style.display = "none";
            mon.style.display = "block";
        }
        i ++;
    });
}
check();

// client-review-swiper
var swiper = new Swiper(".client-review-swiper", {
    loop: false,
    autoplay: {
        delay: 2500,
        disableOnInteraction: false,
    },
    navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
    },
    pagination: {
        clickable: true,
        el: ".swiper-pagination",
    },
});

// counter-value
function counter() {
    var counter = document.querySelectorAll('.counter-value');
    if (counter) {
        var speed = 250; // The lower the slower
        counter && Array.from(counter).forEach(function (counter_value) {
            function updateCount() {
                var target = +counter_value.getAttribute('data-target');
                var count = +counter_value.innerText;
                var inc = target / speed;
                if (inc < 1) {
                    inc = 1;
                }
                // Check if target is reached
                if (count < target) {
                    // Add inc to count and output in counter_value
                    counter_value.innerText = (count + inc).toFixed(0);
                    // Call function every ms
                    setTimeout(updateCount, 1);
                } else {
                    counter_value.innerText = numberWithCommas(target);
                }
                numberWithCommas(counter_value.innerText);
            };
            updateCount();
        });

        function numberWithCommas(x) {
            return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    }
};
counter();


//
/********************* scroll top js ************************/
//

var myButton = document.getElementById("back-to-top");

// When the user scrolls down 20px from the top of the document, show the button
window.onscroll = function () {
    scrollFunction();
};

function scrollFunction() {
    if (!myButton) return;
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
        myButton.style.display = "block";
    } else {
        myButton.style.display = "none";
    }
}

// When the user clicks on the button, scroll to the top of the document
function topFunction() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}