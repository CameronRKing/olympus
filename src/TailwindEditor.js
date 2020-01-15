const families = require('./tailwind-families.json');
const shortcuts = require('./tailwind-shortcuts.json');
const { pairs, mapWithKeys, mapInvert, assocIn } = require('./utils.js');

exports.familyToClasses = families;
const classToFamily = pairs(families).map(([propsAffected, classes]) =>
    mapWithKeys(classes, cclass => [cclass, propsAffected])
).reduce((acc, lookup) => assocIn(acc, lookup), {});
exports.classToFamily = classToFamily;

const shortcutToClass = shortcuts;
exports.shortcutToClass = shortcutToClass;
const classToShortcut = mapInvert(shortcutToClass);
exports.classToShortcut = classToShortcut;
const allClasses = Object.values(families).reduce((acc, arr) => acc.concat(arr), []);
exports.allClasses = allClasses;

function getPatch(classList, givenClass) {
    // if it's already there, remove it
    if (classList.includes(givenClass)) {
        return { remove: givenClass }
    } else {
        const family = classToFamily[givenClass];
        const existingFamilyMember = classList.find(cclass => classToFamily[cclass] == family);
        if (existingFamilyMember) {
            return {
                remove: existingFamilyMember,
                add: givenClass
            };
        } else {
            return {
                add: givenClass
            }
        }
    }
}
exports.getPatch = getPatch;

// selection is an ad hoc object from the first prototype that combines an on-screen element with its source hast node
// givenClass is a string containing the new tailwind class that we've received
// if on the element, it's removed
// if there's another family member (affecting the exact same attributes), the new one replaces the old one
// else it just gets added
// this function does this to both the on-screen element and the hast node
function editTailwindClasses(selection, givenClass) {
    const el = selection.el;
    return selection.findByDataId(node => {
        if (!node.attrs) node.attrs = {};
        if (!node.attrs.class) node.attrs.class = '';

        const elList = el.classList;
        const srcList = node.attrs.class.split(' ').filter(str => str); // remove empty strings
        const { remove, add } = getPatch(Array.from(elList), givenClass);
        if (remove) {
            elList.remove(remove);
            srcList.splice(srcList.indexOf(remove), 1);
        }
        if (add) {
            elList.add(add);
            srcList.push(add);
        }
        node.attrs.class = srcList.join(' ');
        return node;
    });
}