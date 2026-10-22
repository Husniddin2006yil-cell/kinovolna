"""Browser regressions with explicit Telegram, Commons API and audio transport doubles.
Run: python3 tests/ui-browser.py (requires Playwright and Vite on localhost:5173).
The audio test uses a generated local WAV and does not contact Wikimedia or production services.
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
track = {
    'id': 'commons-test', 'title': 'Open test audio', 'artist': 'Test composer', 'album': 'Свободный аудиоархив',
    'duration': '1:00', 'coverStyle': 'cover-blue', 'tone': 'CC BY 4.0', 'licenseName': 'CC BY 4.0',
    'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/', 'sourceUrl': 'https://commons.wikimedia.org/wiki/File:open-test-audio.mp3',
    'moods': [], 'audioUrl': 'https://upload.wikimedia.org/test.wav', 'source': 'commons',
}
next_track = {**track, 'id': 'commons-test-next', 'title': 'Next open test audio', 'sourceUrl': 'https://commons.wikimedia.org/wiki/File:next-open-test-audio.mp3', 'audioUrl': 'https://upload.wikimedia.org/test-next.wav'}
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

def api(route):
    path = route.request.url.split(BASE)[-1]
    if '/api/config' in path:
        body = {'telegramConfigured': True, 'databaseConfigured': True, 'channelConfigured': True, 'tmdbConfigured': True, 'audioRecognitionConfigured': False}
    elif '/trailer' in path:
        body = {'trailer': {'key': 'QwErTy12345', 'name': 'Official test trailer', 'type': 'Trailer', 'official': True, 'sourceUrl': 'https://www.youtube.com/watch?v=QwErTy12345'}, 'attribution': 'TMDB'}
    elif '/api/catalog' in path or '/api/films' in path:
        body = {'items': [film], 'pagination': {'total': 1, 'limit': 100, 'offset': 0}}
    elif '/api/music/search' in path:
        body = {'provider': 'Wikimedia Commons', 'items': [track, next_track]}
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
    context.add_init_script(TELEGRAM)
    context.route('**/api/**', api)
    context.route('https://upload.wikimedia.org/test.wav', lambda r: r.fulfill(status=200, content_type='audio/wav', body=wave_bytes.getvalue()))
    context.route('https://upload.wikimedia.org/test-next.wav', lambda r: r.fulfill(status=200, content_type='audio/wav', body=wave_bytes.getvalue()))
    context.route('https://www.youtube-nocookie.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<html><body>Embedded trailer test double</body></html>'))
    context.route('https://telegram.org/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    page = context.new_page()
    page.add_init_script("if (location.protocol === 'http:' && location.hostname === '127.0.0.1') { localStorage.setItem('kinovolna:music-library', JSON.stringify([{id:'old-seed',title:'Old saved track'}])); localStorage.setItem('kinovolna:music-favorites', JSON.stringify(['old-seed'])); localStorage.setItem('kinovolna:music-history', JSON.stringify(['old-seed'])); }")
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.locator('.mobile-nav').wait_for()
    initial_height = page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height')
    assert initial_height == 600, initial_height
    expands_at_start = page.evaluate('window.__expands')
    page.get_by_role('button', name='Поиск', exact=True).click()
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    assert page.evaluate('window.__expands') == expands_at_start
    assert page.evaluate('document.activeElement.tagName') != 'INPUT'
    assert page.locator('.main-search-input').evaluate('(e)=>getComputedStyle(e).fontSize') == '16px'
    assert page.evaluate('document.documentElement.scrollWidth') == 390
    passed('Search keeps the initial Telegram viewport, does not expand/autofocus, and avoids horizontal overflow')

    page.get_by_role('button', name='Кино', exact=True).click()
    page.get_by_role('button', name='Подробнее: Test movie', exact=True).click()
    page.get_by_role('button', name='Смотреть трейлер', exact=True).click()
    trailer_frame = page.locator('iframe.film-trailer-frame')
    trailer_frame.wait_for()
    assert trailer_frame.get_attribute('src') == 'https://www.youtube-nocookie.com/embed/QwErTy12345?autoplay=1&rel=0'
    assert page.get_by_text('Ограничение Telegram на размер файла к этому потоку не применяется.', exact=False).is_visible()
    page.get_by_role('button', name='Закрыть трейлер', exact=True).click()
    page.get_by_role('button', name='Назад', exact=True).click()
    passed('TMDB-listed trailer opens in an inline YouTube player; Telegram’s bot-file size limit is not applied to the external stream')

    page.locator('.main-search-input').fill('Test')
    page.set_viewport_size({'width': 390, 'height': 380})
    page.wait_for_timeout(100)
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 380
    page.set_viewport_size({'width': 390, 'height': 700})
    page.wait_for_timeout(100)
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    page.evaluate("window.Telegram.WebApp.viewportHeight=690;(window.__tgHandlers.viewportChanged||[]).forEach(f=>f())")
    assert page.locator('.app-shell').evaluate('(e)=>e.getBoundingClientRect().height') == 600
    passed('Keyboard viewport shrink restores the stable Mini App height')

    page.get_by_role('button', name='Музыка', exact=True).click()
    assert page.get_by_text('Начните с чистого листа', exact=True).is_visible()
    assert page.locator('.track-row').count() == 0
    assert page.evaluate("JSON.parse(localStorage.getItem('kinovolna:music-library'))") == []
    assert page.evaluate("JSON.parse(localStorage.getItem('kinovolna:music-favorites'))") == []
    assert page.evaluate("JSON.parse(localStorage.getItem('kinovolna:music-history'))") == []
    recognition = page.get_by_role('button', name='Распознавание не подключено', exact=True)
    recognition.wait_for()
    assert recognition.is_disabled()
    assert page.get_by_text('Сервис AudD не подключён.', exact=False).is_visible()
    search_input = page.locator('.music-search input')
    assert search_input.evaluate('(e)=>getComputedStyle(e).fontSize') == '16px'
    search_input.fill('test song')
    page.locator('.music-search').evaluate('(e)=>e.requestSubmit()')
    row = page.locator('.track-row').filter(has=page.get_by_text('Open test audio', exact=True))
    row.wait_for()
    assert row.locator('a').count() == 2
    assert row.locator('a').nth(0).get_attribute('href') == track['sourceUrl']
    assert row.locator('a').nth(1).get_attribute('href') == track['licenseUrl']
    music_text = page.locator('.music-page').inner_text()
    assert 'YouTube' not in music_text and 'Deezer' not in music_text
    assert page.locator('iframe').count() == 0
    passed('Music opens with no embedded or demo tracks; search displays only Commons audio rows with creator, file and license links, without a video iframe')

    row.get_by_role('button', name='Добавить трек в избранное').click()
    assert 'is-favorite' in row.get_by_role('button', name='Убрать трек из избранного').get_attribute('class')
    row.get_by_role('button', name='Воспроизвести: Open test audio').click()
    page.wait_for_function("document.querySelector('audio').currentTime > 0.5 && !document.querySelector('audio').paused")
    assert 'track-row-active' in row.first.get_attribute('class')
    page.evaluate('window.__originalAudio=document.querySelector("audio")')
    t0 = page.locator('audio').evaluate('(e)=>e.currentTime')
    for section in ['Кино', 'Поиск', 'Профиль', 'Главная']:
        page.get_by_role('button', name=section, exact=True).click()
        assert page.evaluate('window.__originalAudio===document.querySelector("audio")')
        assert not page.locator('audio').evaluate('(e)=>e.paused')
    page.wait_for_timeout(300)
    assert page.locator('audio').evaluate('(e)=>e.currentTime') > t0
    passed('One real audio element keeps playing across all app sections')

    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(250)
    assert not page.locator('audio').evaluate('(e)=>e.paused')
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))")
    page.get_by_role('button', name='Пауза', exact=True).click()
    assert page.locator('audio').evaluate('(e)=>e.paused')
    page.get_by_role('button', name='Воспроизвести', exact=True).click()
    page.wait_for_function('!document.querySelector("audio").paused')
    page.get_by_role('button', name='Вернуться к плееру').click()
    page.get_by_role('button', name='Свернуть плеер').click()
    assert page.evaluate('window.__originalAudio===document.querySelector("audio")')
    assert not page.locator('audio').evaluate('(e)=>e.paused')
    passed('Mini-player Play/Pause, expand/collapse and hidden-page simulation preserve the same audio element')
    page.get_by_role('button', name='Вернуться к плееру').click()
    page.get_by_role('button', name='Следующая запись').click()
    page.wait_for_function("!document.querySelector('audio').paused && document.querySelector('audio').src.endsWith('/test-next.wav')")
    page.get_by_role('button', name='Вернуться к плееру').click()
    seek = page.get_by_role('slider', name='Позиция воспроизведения')
    seek.wait_for()
    seek.evaluate("(e)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'15');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}")
    page.wait_for_function("document.querySelector('audio').currentTime >= 14")
    page.get_by_role('button', name='Предыдущая запись').click()
    page.wait_for_function("!document.querySelector('audio').paused && document.querySelector('audio').src.endsWith('/test.wav')")
    assert page.evaluate('window.__originalAudio===document.querySelector("audio")')
    assert not page.locator('audio').evaluate('(e)=>e.paused')
    passed('Next/previous track controls and the player seek bar use the real queued audio element')

    page.get_by_role('button', name='Музыка', exact=True).click()
    assert page.get_by_text('Недавно слушали', exact=True).is_visible()
    assert page.locator('.track-row').filter(has_text='Open test audio').count() >= 1
    page.get_by_role('button', name='Профиль', exact=True).click()
    assert page.get_by_text('Избранные треки', exact=True).is_visible()
    assert page.locator('.track-row').filter(has_text='Open test audio').count() >= 1
    passed('Only an actually started track appears in local recent history and favorites stay available in Profile')

    assert not errors, errors
    passed('No uncaught browser/React errors')
    browser.close()
print(json.dumps({'passed': len(results), 'tests': results}, ensure_ascii=False, indent=2))
