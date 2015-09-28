import React from 'react';
import transform from 'lodash/object/transform';
import has from 'lodash/object/has';
import uid from 'lodash/utility/uniqueId';
import { CssSelectorParser } from 'css-selector-parser';

const PREFIX = 'sub_____';

let parser = new CssSelectorParser();

parser.registerSelectorPseudos('has');
parser.registerNestingOperators('>');
parser.enableSubstitutes();

let prim = value => {
  let typ = typeof value;
  return value === null || ['string', 'number'].indexOf(typ) !== -1
}

export function parse(selector){
  let ast = typeof selector === 'string'
    ? parser.parse(selector)
    : selector;

  if (ast.rule){
    let rule = ast.rule;
    return { rules: getRule(rule), ast }
  }
  else if (ast.selectors) {
    return {
      ast,
      rules: ast.selectors.map(s => getRule(s.rule)),
      multiple: true
    }
  }

  function getRule(rule){
    if (!rule) return []
    return getRule(rule.rule).concat(rule)
  }
}

export function create(options) {
  const NESTING = Object.create(null);
  const PSEUDOS = Object.create(null);

  let { traverse } = options;

  return {
    compile,
    compileRule,
    registerNesting(name, fn){
      NESTING[name] = fn
    },
    registerPseudo(name, fn){
      PSEUDOS[name] = fn
    }
  }

  function compile(selector, values = Object.create(null)){
    let { rules, ast, multiple } = parse(selector);

    if (!multiple)
      return compileRule(rules, null, values, ast)

    return rules
      .map(ruleSet => compileRule(ruleSet, null, values, ast))
      .reduce((current, next)=> {
        return (root, parent) => current(root, parent) || next(root, parent)
      })
  }

  function compileRule(rules, parent, values, ast){
    let fns = [];
    let rule = rules.shift();

    if (rule.tagName)
      fns.push(getTagComparer(rule, values))

    if (rule.attrs)
      fns.push(getPropComparer(rule, values))

    if (rule.classNames)
      fns.push(({ props: { className } }) => {
        return rule.classNames.every(clsName =>
          className && className.indexOf(clsName) !== -1)
      })

    if (rule.pseudos) {
      fns = fns.concat(
        rule.pseudos.map(pseudo => {
          if (!PSEUDOS[pseudo.name])
            throw new Error('psuedo element: ' + psuedo.name + ' is not supported')
          return PSEUDOS[pseudo.name](pseudo, values, options)
        })
      )
    }

    if (rule.hasOwnProperty('nestingOperator') ){
      let operator = rule.nestingOperator || 'any'
      let nestedCompiled = compileRule(rules, rule, values, ast);

      if (!NESTING[operator])
        throw new Error('nesting operator: ' + operator + ' is not supported')

      fns.push(NESTING[operator](nestedCompiled))
    }

    return fns.reduce((current, next = ()=> true)=> {
      return (root, parent)=> next(root, parent) && current(root, parent)
    })
  }
}

function getTagComparer(rule, values) {
  let isStr = t => typeof t === 'string'
  let tagName = values[rule.tagName] || rule.tagName;

  if (rule.tagName === '*')
    return ()=> true

  if (isStr(tagName)){
    tagName = tagName.toUpperCase();
    return root => isStr(root.type) && root.type.toUpperCase() === tagName;
  }

  return root => root.type === tagName
}

function getPropComparer(rule, values) {
  return ({ props }) => rule.attrs.every(attr => {
    if (!has(attr, 'value'))
      return !!props[attr.name]

    if (!has(values, attr.value))
      return props[attr.name] == attr.value

    return props[attr.name] === values[attr.value]
  })
}