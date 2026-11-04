#!/usr/bin/env python3
"""Regenerates the thin HTML shells in public/. Each page is a shell; content is rendered by public/js/pages or public/js/admin."""
import os, html
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
NAME = 'ICF REFLEX'
# path, page, title, description, guard, noindex, extra data attrs
P = [
 ('index.html','home','Watch anime online','Discover, watch and track anime on ICF REFLEX. YOUR ANIME. YOUR UNIVERSE.'),
 ('browse.html','browse','Browse anime','Browse the anime catalog by genre, year, status and type.'),
 ('search.html','search','Search anime','Search anime by title.'),
 ('genres.html','genres','Genres','All anime genres.'),
 ('genre.html','genre','Genre','Anime in this genre.'),
 ('trending.html','trending','Trending anime','Editor-curated trending anime.'),
 ('new-releases.html','new-releases','New releases','Newly added anime and episodes.'),
 ('schedule.html','schedule','Release schedule','Upcoming and recently released anime episodes.'),
 ('anime.html','anime','Anime details','Anime details, seasons and episodes.'),
 ('watch.html','watch','Watch','Watch anime episodes.'),
 ('about.html','about','About','About ICF REFLEX.'),
 ('contact.html','contact','Contact','Contact ICF REFLEX.'),
 ('privacy.html','privacy','Privacy policy','How ICF REFLEX handles your data.'),
 ('terms.html','terms','Terms of use','Terms of use for ICF REFLEX.'),
 ('pricing.html','soon','Premium','Premium plans are coming soon.',None,False,{'title':'Premium','text':'Premium plans need a verified payment provider and a trusted backend, which are not set up yet. Everything on ICF REFLEX is free for now.'}),
 ('community.html','soon','Community','Community discussions are coming soon.',None,False,{'title':'Community','text':'Discussions need moderation tooling and a trusted backend. This feature is planned for a later phase.'}),
 ('watch-party.html','soon','Watch Party','Watch Party is coming soon.',None,False,{'title':'Watch Party','text':'Synchronised viewing and chat need trusted real-time infrastructure that the free Spark setup does not include.'}),
 ('login.html','login','Log in','Log in to ICF REFLEX.',None,True),
 ('register.html','register','Create account','Create your ICF REFLEX account.',None,True),
 ('forgot-password.html','forgot-password','Forgot password','Reset your ICF REFLEX password.',None,True),
 ('reset-password.html','reset-password','Reset password','Choose a new password.',None,True),
 ('verify-email.html','verify-email','Verify your email','Verify your email address.',None,True),
 ('dashboard/index.html','dashboard','Dashboard','Your ICF REFLEX dashboard.','auth',True),
 ('dashboard/profile.html','profile','Profile','Edit your profile.','auth',True),
 ('dashboard/watchlist.html','watchlist','Watchlist','Your saved anime.','auth',True),
 ('dashboard/continue-watching.html','continue-watching','Continue watching','Pick up where you left off.','auth',True),
 ('dashboard/history.html','history','Watch history','Episodes you have watched.','auth',True),
 ('dashboard/settings.html','settings','Settings','Theme and language settings.','auth',True),
 ('dashboard/reviews.html','soon','Reviews','Reviews are coming soon.','auth',True,{'title':'Reviews','text':'Ratings and reviews arrive in Phase 2, together with moderation tools.'}),
 ('dashboard/notifications.html','soon','Notifications','Notifications are coming soon.','auth',True,{'title':'Notifications','text':'Notifications arrive in Phase 2.'}),
 ('dashboard/subscription.html','soon','Subscription','Subscriptions are coming soon.','auth',True,{'title':'Subscription','text':'Premium subscriptions need a verified payment provider and a trusted backend. Not available yet.'}),
 ('dashboard/billing.html','soon','Billing','Billing is coming soon.','auth',True,{'title':'Billing','text':'Billing is not available because payments are not enabled.'}),
 ('admin/index.html','admin','Admin','Admin overview.','staff',True),
 ('admin/anime.html','admin-anime','Admin · Anime','Manage anime.','content',True),
 ('admin/seasons.html','admin-seasons','Admin · Seasons','Manage seasons.','content',True),
 ('admin/episodes.html','admin-episodes','Admin · Episodes','Manage episodes.','content',True),
 ('admin/video.html','admin-video','Admin · Video sources','Manage video sources.','content',True),
 ('admin/genres.html','admin-genres','Admin · Genres','Manage genres.','content',True),
 ('admin/featured.html','admin-featured','Admin · Featured','Manage featured content.','content',True),
 ('admin/users.html','admin-users','Admin · Users','View users.','admin',True),
 ('admin/roles.html','admin-roles','Admin · Roles','Manage roles.','super',True),
 ('admin/reviews.html','soon','Admin · Reviews','Review moderation is coming soon.','mod',True,{'title':'Review moderation','text':'Reviews are a Phase 2 feature. Playback reports can be handled on the Reports page.'}),
 ('admin/reports.html','admin-reports','Admin · Reports','Handle reports.','mod',True),
 ('admin/settings.html','admin-settings','Admin · Settings','Admin settings.','staff',True),
]
T = '''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
{robots}<meta property="og:site_name" content="{name}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#09090F">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Space+Grotesk:wght@500;700&amp;family=Noto+Sans+JP:wght@400;700&amp;family=Noto+Sans+Bengali:wght@400;700&amp;display=swap">
<link rel="stylesheet" href="/css/variables.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/layout.css">
{admincss}<script src="/js/theme-init.js"></script>
<script type="module" src="/js/app.js"></script>
</head>
<body data-page="{page}"{attrs}>
<a class="skip-link" href="#main">Skip to content</a>
<div id="site-header"></div>
<main id="main" tabindex="-1"><div id="app" class="container"><noscript><p>{name} needs JavaScript to run.</p></noscript></div></main>
<div id="site-footer"></div>
<div id="toast-region" class="toast-region" aria-live="polite"></div>
</body>
</html>
'''
for row in P:
    path, page, title, desc = row[:4]
    guard = row[4] if len(row) > 4 else None
    noindex = row[5] if len(row) > 5 else False
    extra = row[6] if len(row) > 6 else {}
    attrs = (f' data-guard="{guard}"' if guard else '') + ''.join(f' data-{k}="{html.escape(v, quote=True)}"' for k, v in extra.items())
    full = f'{title} — {NAME}' if path != 'index.html' else f'{NAME} — {title}'
    out = T.format(title=html.escape(full), desc=html.escape(desc, quote=True), name=NAME, page=page, attrs=attrs,
                   robots='<meta name="robots" content="noindex">\n' if noindex else '',
                   admincss='<link rel="stylesheet" href="/css/admin.css">\n' if path.startswith('admin/') else '')
    dest = os.path.join(ROOT, path); os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, 'w').write(out)
print(len(P), 'pages written')
