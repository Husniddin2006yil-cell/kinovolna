import test from 'node:test';
import assert from 'node:assert/strict';
import { movieCopyOptions, plainMovieCaption } from '../server/movie-caption.mjs';

test('plainMovieCaption retains a legitimate title while flattening whitespace', () => {
  assert.equal(plainMovieCaption('  The @Channel Movie\n'), 'The @Channel Movie');
  assert.equal(plainMovieCaption('T@channel: The Story'), 'T@channel: The Story');
});

test('plainMovieCaption removes standalone channel attribution, links, and forwarding labels', () => {
  const title = '@kinovolna | The Matrix — Переслано от @movie_archive https://t.me/movie_archive/55';
  assert.equal(plainMovieCaption(title), 'The Matrix');
  assert.equal(plainMovieCaption('Arrival | Forwarded from @movie_archive https://example.test/post'), 'Arrival');
  assert.equal(plainMovieCaption('Forwarded from @movie_archive: Arrival'), 'Arrival');
});

test('plainMovieCaption removes Telegram URI and parenthesized channel attribution', () => {
  assert.equal(plainMovieCaption('The Matrix (@kinovolna) tg://resolve?domain=kinovolna'), 'The Matrix');
  assert.equal(plainMovieCaption('Film [@kinovolna]'), 'Film');
});

test('movieCopyOptions sets a title-only plain caption and disables source entities and keyboard', () => {
  assert.deepEqual(movieCopyOptions('Movie @kinovolna https://t.me/kinovolna/9'), {
    protect_content: true,
    caption: 'Movie',
    caption_entities: [],
    reply_markup: { inline_keyboard: [] },
  });
});
