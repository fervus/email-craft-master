// Minimal safe version to test if app works
console.log('App-minimal loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Just show a simple alert to test if JS is working
    setTimeout(() => {
        alert('MailCraft Desktop is working! Click OK to continue.');
    }, 1000);
    
    // Add simple click handlers
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            console.log('Button clicked:', this.textContent);
        });
    });
});