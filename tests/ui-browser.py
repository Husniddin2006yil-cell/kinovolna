"""UI regressions with explicit API, Telegram and YouTube doubles; no production writes.
Run: python3 tests/ui-browser.py (requires Playwright and a Vite server on localhost:5173).
Override UI_TEST_URL and CHROMIUM_PATH as needed. The audio continuity test uses real HTMLMediaElement playback of a generated local WAV.
"""
import io
import json
import math
import os
import struct
import wave
from playwright.sync_api import sync_playwright

BASE = os.environ.get('UI_TEST_URL', 'http://127.0.0.1:5173')
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
film = {'id': 'tmdb-movie-1', 'title': 'Test movie', 'originalTitle': 'Test movie', 'year': 2026, 'rating': '8.5', 'genre': 'Драма', 'duration': '2 ч', 'description': 'Test metadata', 'poster': '/favicon.svg', 'kind': 'Фильм', 'source': 'tmdb'}
track = {'id': 'deezer-test', 'title': 'Local test audio', 'artist': 'Test artist', 'album': 'Test', 'duration': '1:00', 'coverStyle': 'cover-blue', 'tone': 'Deezer preview', 'moods': [], 'audioUrl': f'{BASE}/test.wav', 'source': 'deezer'}
wave_bytes = io.BytesIO()
with wave.open(wave_bytes, 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(8000)
    audio.writeframes(b''.join(struct.pack('<h', int(100 * math.sin(i * 0.1))) for i in range(8000 * 60)))

TELEGRAM = """
window.__tgHandlers={};window.__expands=0;
window.Telegram={WebApp:{initData:'explicit-test-double',viewportStableHeight:600,viewportHeight:600,isActive:true,ready(){},expand(){window.__expands++},onEvent(n,f){(window.__tgHandlers[n]??=[]).push(f)},offEvent(n,f){window.__tgHandlers[n]=(window.__tgHandlers[n]||[]).filter(x=>x!==f)}}};
"""
YOUTUBE = """
window.__yt={created:0,destroyed:0,loads:[],pauses:0,instance:null};
window.YT={Player:class {
 constructor(element,options){this.el=element;this.events=options.events;this.position=0;this.state=5;window.__yt.created++;window.__yt.instance=this;this.timer=setInterval(()=>{if(this.state===1)this.position+=0.2},200);setTimeout(()=>this.events.onReady(),20)}
 loadVideoById(o){this.position=o.startSeconds||0;window.__yt.loads.push(o.videoId);this.playVideo()}
 cueVideoById(o){this.position=o.startSeconds||0;window.__yt.loads.push(o.videoId);this.state=5;this.events.onStateChange({data:5})}
 playVideo(){this.state=1;this.events.onStateChange({data:1})}
 pauseVideo(){window.__yt.pauses++;this.state=2;this.events.onStateChange({data:2})}
 getCurrentTime(){return this.position} getDuration(){return 180}
 seekTo(t){this.position=t}
 destroy(){window.__yt.destroyed++;clearInterval(this.timer);this.el.remove()}
}};
"""

def api(route):
    path = route.request.url.split(BASE)[-1]
    if '/api/config' in path:
        body = {'telegramConfigured': True, 'databaseConfigured': True, 'channelConfigured': True, 'tmdbConfigured': True, 'youtubeConfigured': True}
    elif '/api/catalog' in path:
        body = {'items': [film], 'pagination': {'total': 1, 'limit': 100, 'offset': 0}}
    elif '/api/music/catalog' in path:
        body = {'items': [track]}
    elif '/api/music/youtube' in path:
        body = {'items': [{'id': 'youtube-abcdefghijk', 'videoId': 'abcdefghijk', 'title': 'Test YouTube music', 'artist': 'Test channel', 'album': 'YouTube', 'duration': 'YouTube', 'thumbnailUrl': None, 'videoUrl': 'https://www.youtube.com/watch?v=abcdefghijk'}, {'id': 'youtube-lmnopqrstuv', 'videoId': 'lmnopqrstuv', 'title': 'Second YouTube music', 'artist': 'Test channel', 'album': 'YouTube', 'duration': 'YouTube', 'thumbnailUrl': None, 'videoUrl': 'https://www.youtube.com/watch?v=lmnopqrstuv'}]}
    else:
        body = {'items': []}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

results = []
def passed(name):
    results.append(name)
    print(f'PASS: {name}', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width': 390, 'height': 700}, reduced_motion='reduce')
    context.add_init_script(TELEGRAM + YOUTUBE)
    context.route('**/api/**', api)
    context.route('**/test.wav', lambda r: r.fulfill(status=200, content_type='audio/wav', body=wave_bytes.getvalue()))
    context.route('https://telegram.org/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    # Only explicit doubles in this regression: do not hit live YouTube or Commons.
    context.route('https://www.youtube.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<html>Explicit player transport double</html>'))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.locator('.mobile-nav').wait_for()
    initial_height = page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height')
    assert initial_height == 600, initial_height
    page.get_by_role('button', name='Поиск', exact=True).click()
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    assert page.evaluate('window.__expands') == 0
    assert page.evaluate('document.activeElement.tagName') != 'INPUT'
    assert page.locator('.main-search-input').evaluate('(e)=>getComputedStyle(e).fontSize') == '16px'
    assert page.evaluate('document.documentElement.scrollWidth') == 390
    passed('Search keeps initial Telegram height, no expand/autofocus/horizontal overflow, 16px input')

    page.locator('.main-search-input').fill('Test')
    page.set_viewport_size({'width': 390, 'height': 380})
    page.wait_for_timeout(100)
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 380
    page.set_viewport_size({'width': 390, 'height': 700})
    page.wait_for_timeout(100)
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    page.evaluate("window.Telegram.WebApp.viewportHeight=690;(window.__tgHandlers.viewportChanged||[]).forEach(f=>f())")
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    passed('Keyboard shrink restores original height and Telegram expansion does not enlarge layout')

    page.get_by_role('button', name='Музыка', exact=True).click()
    page.get_by_role('button', name='Статус аудиоисточника: Local test audio', exact=True).click()
    page.wait_for_function("document.querySelector('audio').currentTime > 0.5 && !document.querySelector('audio').paused")
    page.evaluate('window.__originalAudio=document.querySelector("audio")')
    t0 = page.locator('audio').evaluate('(e)=>e.currentTime')
    for section in ['Кино', 'Поиск', 'Профиль', 'Главная']:
        page.get_by_role('button', name=section, exact=True).click()
        assert page.evaluate('window.__originalAudio===document.querySelector("audio")')
        assert not page.locator('audio').evaluate('(e)=>e.paused')
    page.wait_for_timeout(300)
    assert page.locator('audio').evaluate('(e)=>e.currentTime') > t0
    passed('Real HTML audio element and playback position survive every SPA section')
    page.get_by_role('button', name='Пауза', exact=True).click()
    assert page.locator('audio').evaluate('(e)=>e.paused')
    page.get_by_role('button', name='Воспроизвести', exact=True).click()
    page.wait_for_function('!document.querySelector("audio").paused')
    page.get_by_role('button', name='Вернуться к плееру').click()
    page.get_by_role('button', name='Свернуть плеер').click()
    assert page.evaluate('window.__originalAudio===document.querySelector("audio")')
    assert not page.locator('audio').evaluate('(e)=>e.paused')
    passed('Mini-player Play/Pause and expand/collapse operate the same audio element')

    page.get_by_role('button', name='Музыка', exact=True).click()
    page.locator('.music-search input').fill('test song')
    page.locator('.music-search').evaluate('(e)=>e.requestSubmit()')
    page.get_by_role('button', name='Статус аудиоисточника: Test YouTube music', exact=True).click()
    page.wait_for_function('window.__yt.loads.length > 0')
    page.evaluate('window.__originalIframe=document.querySelector(".youtube-player-host iframe")')
    created = page.evaluate('window.__yt.created')
    assert page.locator('audio').evaluate('(e)=>e.paused')
    assert page.locator('.youtube-player-host iframe').get_attribute('referrerpolicy') == 'strict-origin-when-cross-origin'
    iframe_src = page.locator('.youtube-player-host iframe').get_attribute('src')
    assert 'enablejsapi=1' in iframe_src and 'origin=' in iframe_src
    rect = page.locator('.youtube-player-host iframe').bounding_box()
    assert rect['height'] >= 200 and rect['width'] >= 200
    passed('YouTube uses visible 200x200+ official iframe with explicit identity policy; previous audio pauses')
    for section in ['Кино', 'Поиск', 'Профиль', 'Главная']:
        page.get_by_role('button', name=section, exact=True).click()
        assert page.evaluate('window.__originalIframe===document.querySelector(".youtube-player-host iframe")')
        assert page.evaluate('window.__yt.created') == created
        assert page.evaluate('window.__yt.instance.state') == 1
    page.get_by_role('button', name='Пауза', exact=True).click()
    assert page.evaluate('window.__yt.instance.state') == 2
    page.get_by_role('button', name='Воспроизвести', exact=True).click()
    assert page.evaluate('window.__yt.instance.state') == 1
    passed('YouTube iframe identity and playback survive SPA navigation; mini-controls call real adapter')

    page.get_by_role('button', name='Музыка', exact=True).click()
    page.get_by_role('button', name='Статус аудиоисточника: Second YouTube music', exact=True).click()
    assert page.evaluate('window.__yt.created') == created
    assert page.evaluate('window.__yt.loads.at(-1)') == 'lmnopqrstuv'
    passed('Selecting another YouTube result reuses the same iframe')

    page.set_viewport_size({'width': 390, 'height': 380})
    page.wait_for_timeout(100)
    assert page.evaluate('window.__yt.instance.state') == 2
    assert not page.locator('.youtube-player-host iframe').is_visible()
    page.set_viewport_size({'width': 390, 'height': 700})
    page.wait_for_timeout(100)
    assert page.locator('.youtube-player-host iframe').is_visible()
    assert page.evaluate('window.__yt.created') == created
    page.get_by_role('button', name='Воспроизвести', exact=True).click()
    page.evaluate('window.Telegram.WebApp.isActive=false;(window.__tgHandlers.deactivated||[]).forEach(f=>f())')
    page.wait_for_timeout(100)
    assert page.evaluate('window.__yt.instance.state') == 2
    passed('Too-small viewport and inactive Telegram pause YouTube without destroying it')
    page.evaluate('window.Telegram.WebApp.isActive=true;(window.__tgHandlers.activated||[]).forEach(f=>f())')
    page.wait_for_timeout(100)
    assert page.evaluate('window.__yt.instance.state') == 2
    page.evaluate('window.__yt.instance.events.onAutoplayBlocked()')
    page.get_by_text('Нажмите Play в плеере: браузер запретил автоматический запуск.').wait_for()
    page.get_by_role('button', name='Воспроизвести', exact=True).click()
    page.evaluate('window.__yt.instance.events.onError({data:153})')
    page.get_by_role('link', name='Открыть на YouTube').wait_for()
    assert page.get_by_role('link', name='Открыть на YouTube').get_attribute('href') == 'https://www.youtube.com/watch?v=lmnopqrstuv'
    assert page.locator('.youtube-player-host iframe').is_visible()
    assert page.evaluate('window.__yt.created') == created
    passed('Autoplay block and error 153 show safe recovery without hiding the official frame')
    assert not errors, errors
    passed('No uncaught browser/React errors')
    browser.close()
print(json.dumps({'passed': len(results), 'tests': results}, ensure_ascii=False, indent=2))
