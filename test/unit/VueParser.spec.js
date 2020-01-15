const { expect } = require('chai');
const VueParser = require('../../src/VueParser.js');
describe('Vue Parser, which accepts a string and returns a collection of named ASTs with useful methods', () => {
    let asts;
    const inlineCmp = () => new VueParser(`<script>
export default {}
</script>`);
    const getCmp = async () => {
        const parser = inlineCmp();
        await parser.ready();
        return parser;
    };
    beforeEach(async () => {
        asts = await getCmp();
    });

    describe('components', () => {
        it('imports', () => {
            asts.importComponent('src/components/FooCmp.vue');
            expect(asts.toString()).to.equal(`<script>
import FooCmp from '@/components/FooCmp.vue';
export default {
    components: {
        FooCmp
    }
};
</script>`);
    });

        it('deports', () => {
            asts.importComponent('src/components/FooCmp.vue');
            asts.deportComponent('FooCmp');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`)
        });
    });

    describe('props', () => {
        it('adds props', () => {
            asts.addProp('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    props: ['foo']
};
</script>`);

            asts.updateProp('foo', { default: 'true' });
            asts.addProp('bar');
            expect(asts.toString()).to.equal(`<script>
export default {
    props: {
        foo: {
            default: true
        },
        bar: {}
    }
};
</script>`)
        });

        it('updates required/default/type/validator', () => {
            asts.addProp('foo');
            asts.updateProp('foo', {
                required: 'true',
                default: `'irrelevant'`,
                type: 'String',
                validator: `(val) => val == 'secret-key'`
            });
            expect(asts.toString()).to.equal(`<script>
export default {
    props: {
        foo: {
            required: true,
            default: 'irrelevant',
            type: String,
            validator: (val) => val == 'secret-key'
        }
    }
};
</script>`);
            // set the attribute to null to remove it
            asts.updateProp('foo', {
                required: null,
                default: null,
                type: null,
                validator: null
            });

            expect(asts.toString()).to.equal(`<script>
export default {
    props: ['foo']
};
</script>`);
        });

        it('removes props', () => {
            asts.addProp('foo');
            asts.removeProp('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });
    });

    describe('data', () => {
        it('adds data', () => {
            asts.addData('foo', `'bar'`);
            expect(asts.toString()).to.equal(`<script>
export default {
    data() {
        return {
            foo: 'bar'
        };
    }
};
</script>`);
        });

        it('sets data', () => {
            asts.addData('bar', `'initial-value'`);
            asts.setData('bar', `'new-value'`);
            expect(asts.toString()).to.equal(`<script>
export default {
    data() {
        return {
            bar: 'new-value'
        };
    }
};
</script>`)
        });

        it('removes data', () => {
            asts.addData('bar', `'value'`);
            asts.removeData('bar');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });
    });

    describe('watchers', () => {
        it('adds watchers', () => {
            asts.addWatcher('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo(newVal, oldVal) {}
    }
};
</script>`)
        });

        it('configures deep/immediate', () => {
            asts.addWatcher('foo');
            asts.updateWatcher('foo', { deep: true, immediate: true });
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo: {
            handler(newVal, oldVal) {},
            deep: true,
            immediate: true
        }
    }
};
</script>`);

            asts.updateWatcher('foo', { deep: null, immediate: null });
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo(newVal, oldVal) {}
    }
};
</script>`);
        });

        it('removes watchers', () => {
            asts.addWatcher('foo');
            asts.removeWatcher('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);

            asts.addWatcher('bar');
            asts.updateWatcher('bar', { deep: true, immediate: true });
            asts.removeWatcher('bar');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });
    });

    describe('computed properties', () => {
        it('adds computed', () => {
            asts.addComputed('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    computed: {
        foo() {}
    }
};
</script>`);
        });

        it('updates setter', () => {
            asts.addComputed('foo');
            asts.addComputedSetter('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    computed: {
        foo: {
            get() {},
            set(newValue) {
                this.foo = newValue;
            }
        }
    }
};
</script>`);

            asts.removeComputedSetter('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    computed: {
        foo() {}
    }
};
</script>`);
        });

        it('removes computed', () => {
            asts.addComputed('foo');
            asts.removeComputed('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);

            asts.addComputed('bar');
            asts.addComputedSetter('bar');
            asts.removeComputed('bar');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });
    });

    describe('methods', () => {
        it('adds methods', () => {
            asts.addMethod('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    methods: {
        foo() {}
    }
};
</script>`);
        });

        it('removes methods', () => {
            asts.addMethod('foo');
            asts.removeMethod('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });
    });
});