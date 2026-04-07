/**
 * 深拷贝方法
 * @param {*} obj - 需要深拷贝的对象
 * @param {WeakMap} [hash=new WeakMap()] - 用于解决循环引用的哈希表
 * @returns {*} 深拷贝后的对象
 */
function deepClone(obj, hash = new WeakMap()) {
    // 1. 处理基本类型和null
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // 2. 处理Date对象
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    // 3. 处理正则表达式
    if (obj instanceof RegExp) {
        return new RegExp(obj);
    }

    // 4. 处理数组
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item, hash));
    }

    // 5. 处理Set
    if (obj instanceof Set) {
        const clonedSet = new Set();
        obj.forEach(value => {
            clonedSet.add(deepClone(value, hash));
        });
        return clonedSet;
    }

    // 6. 处理Map
    if (obj instanceof Map) {
        const clonedMap = new Map();
        obj.forEach((value, key) => {
            clonedMap.set(key, deepClone(value, hash));
        });
        return clonedMap;
    }

    // 7. 处理循环引用
    if (hash.has(obj)) {
        return hash.get(obj);
    }

    // 8. 处理普通对象
    const clonedObj = Object.create(Object.getPrototypeOf(obj));
    hash.set(obj, clonedObj);

    // 复制所有属性（包括不可枚举属性）
    const allKeys = [
        ...Object.getOwnPropertyNames(obj),
        ...Object.getOwnPropertySymbols(obj)
    ];

    for (const key of allKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, key);
        
        if (descriptor) {
            if (descriptor.value && typeof descriptor.value === 'object') {
                descriptor.value = deepClone(descriptor.value, hash);
            }
            
            Object.defineProperty(clonedObj, key, descriptor);
        }
    }

    return clonedObj;
}

// 测试用例
function testDeepClone() {
    console.log('=== 深拷贝方法测试 ===\n');

    // 测试1: 基本类型
    console.log('测试1 - 基本类型:');
    const num = 42;
    const str = 'hello';
    const bool = true;
    const nul = null;
    const undef = undefined;
    
    console.log('数字:', deepClone(num) === num); // true
    console.log('字符串:', deepClone(str) === str); // true
    console.log('布尔值:', deepClone(bool) === bool); // true
    console.log('null:', deepClone(nul) === nul); // true
    console.log('undefined:', deepClone(undef) === undef); // true

    // 测试2: 对象和数组
    console.log('\n测试2 - 对象和数组:');
    const originalObj = {
        name: '张三',
        age: 25,
        hobbies: ['reading', 'coding', 'music'],
        address: {
            city: '北京',
            street: '长安街'
        }
    };

    const clonedObj = deepClone(originalObj);
    
    console.log('对象引用不同:', clonedObj !== originalObj); // true
    console.log('嵌套对象引用不同:', clonedObj.address !== originalObj.address); // true
    console.log('数组引用不同:', clonedObj.hobbies !== originalObj.hobbies); // true
    console.log('内容相同:', JSON.stringify(clonedObj) === JSON.stringify(originalObj)); // true
    
    // 修改克隆对象不影响原对象
    clonedObj.name = '李四';
    clonedObj.hobbies.push('sports');
    console.log('原对象name:', originalObj.name); // 张三
    console.log('原对象hobbies长度:', originalObj.hobbies.length); // 3

    // 测试3: 特殊对象
    console.log('\n测试3 - 特殊对象:');
    const date = new Date();
    const regex = /test/gi;
    const set = new Set([1, 2, 3]);
    const map = new Map([['key1', 'value1'], ['key2', { nested: 'object' }]]);
    
    const clonedDate = deepClone(date);
    const clonedRegex = deepClone(regex);
    const clonedSet = deepClone(set);
    const clonedMap = deepClone(map);
    
    console.log('Date类型:', clonedDate instanceof Date && clonedDate.getTime() === date.getTime()); // true
    console.log('正则表达式:', clonedRegex.source === regex.source && clonedRegex.flags === regex.flags); // true
    console.log('Set类型:', clonedSet instanceof Set && clonedSet.size === set.size); // true
    console.log('Map类型:', clonedMap instanceof Map && clonedMap.size === map.size); // true

    // 测试4: 循环引用
    console.log('\n测试4 - 循环引用:');
    const circularObj = { name: '循环引用' };
    circularObj.self = circularObj;
    
    try {
        const clonedCircular = deepClone(circularObj);
        console.log('循环引用处理成功:', clonedCircular !== circularObj); // true
        console.log('循环引用保持:', clonedCircular.self === clonedCircular); // true
    } catch (error) {
        console.log('循环引用处理失败:', error.message);
    }

    // 测试5: Symbol属性
    console.log('\n测试5 - Symbol属性:');
    const sym = Symbol('unique');
    const objWithSymbol = {
        [sym]: 'symbol value',
        normal: 'normal value'
    };
    
    const clonedWithSymbol = deepClone(objWithSymbol);
    console.log('Symbol属性复制:', clonedWithSymbol[sym] === objWithSymbol[sym]); // true

    // 测试6: 不可枚举属性
    console.log('\n测试6 - 不可枚举属性:');
    const objWithHidden = {};
    Object.defineProperty(objWithHidden, 'hidden', {
        value: 'hidden value',
        enumerable: false,
        writable: true,
        configurable: true
    });
    
    const clonedHidden = deepClone(objWithHidden);
    console.log('不可枚举属性复制:', clonedHidden.hidden === 'hidden value'); // true

    console.log('\n=== 测试完成 ===');
}

// 导出方法（根据环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = deepClone;
}

// 运行测试
if (typeof window !== 'undefined' || require.main === module) {
    testDeepClone();
}