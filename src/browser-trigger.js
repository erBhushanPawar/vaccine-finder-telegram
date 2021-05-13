function autoClick() {
    console.log(new Date(), 'auto clicked')
    document.getElementsByClassName('pin-search-btn')[0].click()
    setTimeout(() => {
        document.getElementById('c1').click()
        setTimeout(() => {
            let d = Array.from(document.getElementsByClassName('vaccine-box')).map(c => { return c && c.children && c.children[2] && c.children[2].innerText == 'Age 18+' && c.children[0].innerText.trim() }).filter(t => t !== undefined && t.trim() !== 'NA' && t.trim() !== 'Booked')
            console.log(d)
            if (d.length) {
                var audio = new Audio('https://originscan.in/assets/cheerful-2-528.mp3');
                audio.play();
                clearInterval(intervalInstance)
            } else {
                console.log(new Date(), 'Nothing detected, will try later')
            }
        }, 1500)
    }, 1500)
}


var intervalInstance = setInterval(() => {
    autoClick()
}, 5 * 1000)