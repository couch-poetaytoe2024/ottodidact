// Be conservative: context elsewhere on the screen is not permission to point at it.
// Only the user's question is inspected, never text discovered in the screenshot.
export function requestsOutsideFocus(question:string):boolean {
  return question.split(/[.!?\n]/).some(sentence=>
    !/\b(?:not|never|only|don't|without)\b/i.test(sentence)&&
    /\b(?:explain|annotate|point|highlight|circle|underline|compare|show|discuss|answer)\b.{0,100}\b(?:outside (?:the |my |this )?(?:selection|focus|selected area)|(?:whole|entire|full|rest of (?:the|this)) (?:screen|page|display))\b/i.test(sentence));
}
