// Dummy Data for Streamy UI demonstration
const movies = [
    { title: "Dune: Part Two", year: 2024, rating: "9.2", type: "Movie", quality: "4K" },
    { title: "The Dark Knight", year: 2008, rating: "9.0", type: "Movie", quality: "HD" },
    { title: "Interstellar", year: 2014, rating: "8.6", type: "Movie", quality: "4K" },
    { title: "Blade Runner 2049", year: 2017, rating: "8.0", type: "Movie", quality: "4K" },
    { title: "Avatar: The Way of Water", year: 2022, rating: "7.6", type: "Movie", quality: "4K" },
    { title: "Tenet", year: 2020, rating: "7.3", type: "Movie", quality: "HD" }
];

const tvShows = [
    { title: "Breaking Bad", year: 2008, rating: "9.5", type: "TV Show", quality: "HD" },
    { title: "Stranger Things", year: 2016, rating: "8.7", type: "TV Show", quality: "4K" },
    { title: "The Last of Us", year: 2023, rating: "8.8", type: "TV Show", quality: "4K" },
    { title: "Game of Thrones", year: 2011, rating: "9.2", type: "TV Show", quality: "HD" },
    { title: "Severance", year: 2022, rating: "8.7", type: "TV Show", quality: "4K" },
    { title: "Succession", year: 2018, rating: "8.9", type: "TV Show", quality: "HD" }
];

const anime = [
    { title: "Attack on Titan", year: 2013, rating: "9.1", type: "Anime", quality: "HD" },
    { title: "Jujutsu Kaisen", year: 2020, rating: "8.6", type: "Anime", quality: "HD" },
    { title: "Demon Slayer", year: 2019, rating: "8.7", type: "Anime", quality: "4K" },
    { title: "Solo Leveling", year: 2024, rating: "8.4", type: "Anime", quality: "HD" },
    { title: "One Piece", year: 1999, rating: "8.9", type: "Anime", quality: "HD" },
    { title: "Cyberpunk: Edgerunners", year: 2022, rating: "8.3", type: "Anime", quality: "4K" }
];

// Reusable function to create and append cards
function renderCards(data, containerId, hueStart) {
    const container = document.getElementById(containerId);
    
    // Use consistent distinct gradients based on category
    data.forEach((item, index) => {
        // Create an aesthetically pleasing CSS gradient instead of image
        const hue = hueStart + (index * 15);
        const bgStyle = `background: linear-gradient(135deg, hsl(${hue}, 40%, 20%) 0%, hsl(${hue + 40}, 50%, 10%) 100%);`;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-img-placeholder" style="${bgStyle}">
                <i class="fa-solid fa-film"></i>
                <div class="card-overlay">
                    <div class="play-button">
                        <i class="fa-solid fa-play"></i>
                    </div>
                </div>
            </div>
            <div class="card-content">
                <h3 class="card-title">${item.title}</h3>
                <div class="card-meta">
                    <span>${item.year}</span>
                    <span><i class="fa-solid fa-star" style="color: #F5C518;"></i> ${item.rating}</span>
                    <span class="quality-badge">${item.quality}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Initialize rendering on load
document.addEventListener('DOMContentLoaded', () => {
    // Render the grid elements using dynamic hue shifts for visual differences
    renderCards(movies, 'trending-grid', 260); // Purple hues
    renderCards(tvShows, 'tv-grid', 200);      // Blue/Teal hues
    renderCards(anime, 'anime-grid', 340);     // Red/Pink hues

    // Basic Navbar Scroll Effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if(window.scrollY > 50) {
            navbar.style.background = 'rgba(5, 5, 8, 0.95)';
            navbar.style.borderBottom = '1px solid rgba(157, 78, 221, 0.2)';
        } else {
            navbar.style.background = 'rgba(5, 5, 8, 0.75)';
            navbar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
        }
    });
});
