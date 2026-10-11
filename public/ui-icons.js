// Remplace les emojis du texte par les icônes SVG stylisées de l'application (utilisé par la page d'aide)
(function () {
    'use strict';

    const I = {
        'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
        'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        key: '<path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
        message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
        pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
        home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
        sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
        badgeP: '<rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" stroke="none"/><path d="M9.5 17V7h3.2a2.8 2.8 0 0 1 0 5.6H9.5" stroke="#fff"/>',
        badgeS: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M15.2 8.6c-.6-1-1.7-1.5-3.2-1.5-1.8 0-3 .9-3 2.2 0 3 6.4 1.6 6.4 4.6 0 1.4-1.3 2.3-3.2 2.3-1.5 0-2.7-.6-3.4-1.7" stroke="#fff"/>',
        ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
        hourglass: '<path d="M6 2h12v4l-6 6 6 6v4H6v-4l6-6-6-6z"/>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
        book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
        arrows: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
        pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
        hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
        map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
        presentation: '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M12 16v5M8 21h8"/><path d="m7 12 3-3 2 2 4-4"/>',
        building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
        checksq: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
        minus: '<path d="M5 12h14"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
        corner: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
        timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
        bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>',
        tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.2"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
        folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
        hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15"/>',
        rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
        alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
        'print': '<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
        'refresh': '<path d="M21 12a9 9 0 0 0-15.5-6.2L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.2L21 16"/><path d="M21 21v-5h-5"/>',
        'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        'moon': '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
        'car': '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="14" r=".7"/><circle cx="16.5" cy="14" r=".7"/><path d="M6 17v2M18 17v2"/>',
        'siren': '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M4 21h16v-3H4z"/><path d="M12 3v1.5M4.6 6.6l1 1M19.4 6.6l-1 1M2.5 12H4M20 12h1.5"/>',
        'tower': '<path d="M12 2v3"/><path d="M9.5 22 12 5l2.5 17"/><path d="M8 22h8"/><path d="M10.2 15h3.6"/><path d="M11 10h2"/>',
        'mic': '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
        'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
        'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
        'trash': '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
        'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
        'palette': '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>',
        'star': '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
        'lightbulb': '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
        'flask': '<path d="M9 3h6M10 3v6.2L4.5 19a1.6 1.6 0 0 0 1.4 2.4h12.2a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3"/><path d="M7.5 15h9"/>',
        'database': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
        'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
        'megaphone': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
        'hospital': '<path d="M12 7v6M9 10h6"/><path d="M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"/><path d="M3 21h18M10 21v-4h4v4"/>',
        'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        'alarm': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
        'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        'volume': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
        'volumeOff': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
        'archive': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
        'archiveRestore': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
        'userStar': '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h5"/><path d="m18 13 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.3 3.3-.5z"/>',
        'userSecond': '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h5"/><circle cx="18" cy="18" r="3.5"/>'
    };

    // Premier point de code (sans sélecteur de variation) -> [icône, couleur]
    const MAP = {
        0x2705: ['check-circle', '#2e7d32'], 0x274C: ['x-circle', '#c62828'],
        0x1F4C5: ['calendar'], 0x1F4C6: ['calendar'], 0x1F5D3: ['calendar'],
        0x1F4CB: ['clipboard'], 0x1F465: ['users'], 0x1F4CA: ['chart'], 0x2699: ['settings'],
        0x1F4C4: ['doc'], 0x1F4DD: ['doc'],
        0x1F510: ['lock'], 0x1F512: ['lock'], 0x1F511: ['key'], 0x1F6E1: ['shield'],
        0x1F4F1: ['smartphone'], 0x1F4AC: ['message'],
        0x2709: ['mail'], 0x1F4E7: ['mail'], 0x1F4EC: ['mail'],
        0x1F4CD: ['pin'], 0x1F3E0: ['home'], 0x1F195: ['sparkles', '#ef6c00'],
        0x1F17F: ['userStar', '#1565c0'], 0x1F162: ['userSecond', '#546e7a'],
        0x2753: ['ban'], 0x23F3: ['hourglass'], 0x1F4DE: ['phone'], 0x1F4D6: ['book'],
        0x2194: ['arrows'], 0x270F: ['pencil'], 0x1F522: ['hash'], 0x1F5FA: ['map'], 0x1F441: ['eye'],
        0x1F468: ['presentation'], 0x1F3EB: ['building'], 0x2611: ['checksq'], 0x1F3D6: ['umbrella'],
        0x2796: ['minus'], 0x2795: ['plus'], 0x2328: ['keyboard'], 0x21B5: ['corner'],
        0x1F517: ['link'], 0x1F514: ['bell'], 0x1F527: ['wrench'], 0x1F5A5: ['monitor'],
        0x23F1: ['timer'], 0x1F41B: ['bug'], 0x1F3F7: ['tag'], 0x1F464: ['user'],
        0x1F310: ['globe'], 0x1F5C2: ['folder'], 0x270B: ['hand'], 0x1F680: ['rocket'],
        0x26A0: ['alert', '#f9a825'],
        0x1F5A8: ['print'], 0x1F504: ['refresh'], 0x2600: ['sun', '#f9a825'], 0x1F319: ['moon', '#5c6bc0'],
        0x1F697: ['car'], 0x1F6A8: ['siren', '#e53935'], 0x1F5FC: ['tower'], 0x1F3A4: ['mic'],
        0x1F50D: ['search'], 0x1F4BE: ['save'], 0x1F4E5: ['download'], 0x1F4E4: ['upload'], 0x1F5D1: ['trash'],
        0x2139: ['info', '#1565c0'], 0x1F3A8: ['palette'], 0x2B50: ['star', '#f9a825'], 0x1F4A1: ['lightbulb', '#f9a825'],
        0x1F9EA: ['flask'], 0x1F4BD: ['database'], 0x1F5BC: ['image'], 0x1F4E2: ['megaphone'], 0x1F3E2: ['building'],
        0x1F4CC: ['pin'], 0x1F6AB: ['ban', '#c62828'], 0x2B07: ['download'], 0x2B06: ['upload'], 0x1F4C1: ['folder'], 0x1F4C2: ['folder'], 0x1F3E5: ['hospital'], 0x1F4F7: ['camera'], 0x1F5C4: ['archive'], 0x21A9: ['archiveRestore'], 0x23F0: ['alarm'], 0x1F3B5: ['music'], 0x1F3B6: ['music'], 0x1F50A: ['volume'], 0x1F509: ['volume'], 0x1F508: ['volume'], 0x1F507: ['volumeOff'], 0x1F4F8: ['camera']
    };

    const RE = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'INPUT', 'SELECT']);

    function iconFor(token) {
        const cp = token.codePointAt(0);
        if (cp === 0x26A0 && window.UI_ICONS_KEEP_ALERT) return null;
        const entry = MAP[cp];
        if (!entry) return null;
        const span = document.createElement('span');
        span.innerHTML = '<svg class="ui-emo" viewBox="0 0 24 24" aria-hidden="true" style="color:' + (entry[1] || 'inherit') + ';stroke:currentColor;">' + I[entry[0]] + '</svg>';
        return span.firstChild;
    }

    function convert(node) {
        const parent = node.parentNode;
        if (!parent || SKIP.has(parent.nodeName)) return;
        const text = node.nodeValue;
        if (!text || !RE.test(text)) { RE.lastIndex = 0; return; }
        RE.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, changed = false, m;
        while ((m = RE.exec(text)) !== null) {
            const icon = iconFor(m[0]);
            if (!icon) continue;
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            frag.appendChild(icon);
            last = m.index + m[0].length;
            changed = true;
        }
        RE.lastIndex = 0;
        if (!changed) return;
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        parent.replaceChild(frag, node);
    }

    function scan(root) {
        if (root.nodeType === 3) { convert(root); return; }
        if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convert);
    }

    // Icône sous forme d'image (data URI) : utilisable en arrière-plan CSS, par exemple dans les <option> d'une liste
    function svgDataUrl(inner, color) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#455a64') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
        return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    }
    window.UIIconsApi = {
        urlForEmoji(token, fallbackColor) {
            const entry = MAP[String(token).codePointAt(0)];
            return entry ? svgDataUrl(I[entry[0]], entry[1] || fallbackColor) : null;
        },
        urlForSvg: svgDataUrl,
        urlForName(name, color) { return I[name] ? svgDataUrl(I[name], color) : null; }
    };

    // ---- Infobulles : un attribut title ne peut pas afficher d'icône SVG, on affiche une bulle personnalisée ----
    const escHtml = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function titleToHtml(text) {
        let out = '', last = 0, m;
        RE.lastIndex = 0;
        while ((m = RE.exec(text)) !== null) {
            const entry = MAP[m[0].codePointAt(0)];
            if (!entry || (m[0].codePointAt(0) === 0x26A0 && window.UI_ICONS_KEEP_ALERT)) continue;
            out += escHtml(text.slice(last, m.index));
            out += '<svg class="ui-emo" viewBox="0 0 24 24" aria-hidden="true" style="color:' + (entry[1] || 'inherit') + ';stroke:currentColor;">' + I[entry[0]] + '</svg>';
            last = m.index + m[0].length;
        }
        RE.lastIndex = 0;
        return out + escHtml(text.slice(last));
    }
    function hasConvertibleEmoji(text) {
        let m, found = false;
        RE.lastIndex = 0;
        while ((m = RE.exec(text)) !== null) {
            const cp = m[0].codePointAt(0);
            if (MAP[cp] && !(cp === 0x26A0 && window.UI_ICONS_KEEP_ALERT)) { found = true; break; }
        }
        RE.lastIndex = 0;
        return found;
    }
    let tipEl = null, tipOwner = null, tipTimer = null;
    function hideTip() {
        clearTimeout(tipTimer);
        if (tipEl) tipEl.style.display = 'none';
        if (tipOwner) {
            const saved = tipOwner.getAttribute('data-gp-title');
            if (saved !== null) { tipOwner.setAttribute('title', saved); tipOwner.removeAttribute('data-gp-title'); }
            tipOwner = null;
        }
    }
    function placeTip(x, y) {
        if (!tipEl) return;
        const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
        tipEl.style.left = Math.max(6, Math.min(x + 14, window.innerWidth - w - 8)) + 'px';
        tipEl.style.top = (y + 22 + h > window.innerHeight ? Math.max(6, y - h - 12) : y + 22) + 'px';
    }
    document.addEventListener('mouseover', e => {
        const el = e.target.closest && e.target.closest('[title]');
        if (!el || el === tipOwner) return;
        const text = el.getAttribute('title');
        if (!text || !hasConvertibleEmoji(text)) return;
        hideTip();
        el.setAttribute('data-gp-title', text);
        el.removeAttribute('title');
        tipOwner = el;
        const x = e.clientX, y = e.clientY;
        tipTimer = setTimeout(() => {
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.id = 'gpRichTip';
                tipEl.style.cssText = 'position:fixed;z-index:100001;pointer-events:none;background:#fff;color:#222;border:1px solid #d5dae3;border-radius:10px;padding:7px 12px;font:13px/1.45 -apple-system,Segoe UI,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.22);max-width:380px;white-space:pre-line;';
                document.body.appendChild(tipEl);
            }
            tipEl.innerHTML = titleToHtml(text);
            tipEl.style.display = 'block';
            placeTip(x, y);
        }, 350);
    }, true);
    document.addEventListener('mousemove', e => { if (tipEl && tipEl.style.display === 'block' && tipOwner) placeTip(e.clientX, e.clientY); }, true);
    document.addEventListener('mouseout', e => {
        if (tipOwner && !tipOwner.contains(e.relatedTarget)) hideTip();
    }, true);
    document.addEventListener('mousedown', hideTip, true);
    window.addEventListener('scroll', hideTip, true);

    const style = document.createElement('style');
    style.textContent = '.ui-emo{width:1.15em;height:1.15em;vertical-align:middle;margin:0 .15em;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}';
    document.head.appendChild(style);

    function start() {
        scan(document.body);
        let pending = new Set(), scheduled = false;
        function flush() {
            scheduled = false;
            const batch = pending; pending = new Set();
            batch.forEach(n => { if (n.isConnected) scan(n); });
        }
        new MutationObserver(muts => {
            muts.forEach(mu => mu.addedNodes.forEach(n => pending.add(n)));
            if (!scheduled && pending.size) { scheduled = true; setTimeout(flush, 30); }
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
