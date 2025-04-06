// public/js/modules/swiperSetup.js

let swiperInstances = []; // Keep track of instances

/**
 * Initializes all Swiper instances on the current page.
 */
function initSwipers() {
    // Destroy existing instances first to prevent duplication on potential re-runs
    swiperInstances.forEach(swiper => {
        if (swiper && typeof swiper.destroy === 'function') {
            swiper.destroy(true, true);
        }
    });
    swiperInstances = [];

    document.querySelectorAll('.swiper').forEach(element => {
        const config = {
            loop: false,
            slidesPerView: 'auto',
            spaceBetween: 15,
            navigation: {
                nextEl: element.querySelector('.swiper-button-next'),
                prevEl: element.querySelector('.swiper-button-prev'),
            },
            pagination: {
                el: element.querySelector('.swiper-pagination'),
                clickable: true,
            },
            breakpoints: { // Default breakpoints
                600: { slidesPerView: 3, spaceBetween: 15 },
                800: { slidesPerView: 4, spaceBetween: 20 },
                1024: { slidesPerView: 5, spaceBetween: 20 },
                1200: { slidesPerView: 6, spaceBetween: 25 },
            },
        };

        if (element.classList.contains('cast-swiper')) {
            config.slidesPerView = 3;
            config.breakpoints = {
                640: { slidesPerView: 4, spaceBetween: 15 },
                768: { slidesPerView: 5, spaceBetween: 15 },
                1024: { slidesPerView: 7, spaceBetween: 20 },
            };
        }

        try {
            const swiper = new Swiper(element, config);
            swiperInstances.push(swiper);
        } catch (e) {
            console.error("Failed to initialize Swiper for element:", element, e);
        }
    });
    // console.log("Swipers Initialized:", swiperInstances.length);
}

export { initSwipers };