const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule(presentation) {
    const root = { module: { exports: {} }, console, URL, AbortController, setTimeout, clearTimeout };
    if (presentation) root.MiniConnectionPresentation = presentation;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../firebase-link.js'), 'utf8'), root);
    assert.equal(root.module.exports, root.MiniFirebaseLink);
    return root;
}

function documentFixture() {
    const nodes = new Map();
    function element(tagName) {
        return {
            tagName, children: [], dataset: {}, value: '', hidden: false, disabled: false,
            append(...children) { this.children.push(...children); },
            prepend(...children) { this.children.unshift(...children); },
            replaceChildren(...children) { this.children = children; },
            insertAdjacentElement() {}, addEventListener() {}, focus() {}
        };
    }
    return {
        createElement: element,
        getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, element('div'));
            return nodes.get(id);
        }
    };
}

function mount(root, document) {
    const auth = {
        currentUser: null, onAuthStateChanged: () => () => {},
        setPersistence: async () => {}, signInWithPopup: async () => {},
        signOut: async () => {}, useEmulator() {}
    };
    return root.MiniFirebaseLink.mount({
        document,
        sdk: { initializeApp: () => ({ auth: () => auth }), auth: { GoogleAuthProvider: class {} } },
        config: {
            firebase: { apiKey: 'fixture', authDomain: 'fixture.example.test', projectId: 'fixture', appId: 'fixture' },
            endpoint: 'https://gateway.example.test'
        },
        origin: 'https://mini.example.test'
    });
}

function icons() {
    const calls = [];
    return {
        calls,
        capability: { icon(document, kind) { calls.push(kind); return document.createElement('svg'); } }
    };
}

function cards(document) {
    return document.getElementById('firebase-link-details').children[0].children;
}

test('Firebase account photo metadata is based on current auth user and cleared on sign-out',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../firebase-link.js'),'utf8');
 assert.ok(source.includes("dataset.accountPhoto"));
 assert.ok(source.includes("photoURL"));
});
test('adapter loads and mounts independently without an optional presentation module', () => {
    const root = loadModule(), document = documentFixture();
    assert.equal(mount(root, document).close(), true);
    assert.equal(cards(document).length, 2);
    assert.ok(cards(document).every(card => card.children.every(node => node.tagName !== 'svg')));
});

test('adapter uses an optional icon capability present when its module loads', () => {
    const presentation = icons(), root = loadModule(presentation.capability), document = documentFixture();
    mount(root, document);
    assert.deepEqual(presentation.calls, ['people', 'document']);
    assert.ok(cards(document).every(card => card.children[0].tagName === 'svg'));
});

test('adapter resolves an optional icon capability at mount time after late loading', () => {
    const root = loadModule(), presentation = icons(), document = documentFixture();
    root.MiniConnectionPresentation = presentation.capability;
    mount(root, document);
    assert.deepEqual(presentation.calls, ['people', 'document']);
    assert.ok(cards(document).every(card => card.children[0].tagName === 'svg'));
});
