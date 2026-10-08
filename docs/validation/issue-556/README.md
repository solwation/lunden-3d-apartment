# Hall tidying (#556)

Chromium/SwiftShader; all 22 hallcaretest checks pass with real touch pickup/hook/rack/wardrobe actions, full/closed/wrong retention, true saved reload and reset. Original item ids/stock homes prevent duplicate floor copies.

Floor/tidied images show the same hall camera (1.75/1.62/.7): jacket/sneakers lie in the free aisle, then the same instances hang/stand on their existing rack spaces. Screenshot review caught the earlier partly-occluded floor assumptions; final HALL_CARE starts are outside the actual closed wardrobe and checked through Player.isFree.

Wardrobetest passes all 315 closed seam rays and both sliding tracks. Walktest passes all existing routes/collision checks. perfcount matches #555 at every normal recorded spot; reused models replace original rack decorations, no new lights/passes. One coat space is reserved in the fixed hall wardrobe for the alternative hanging location, with access gated by actual panel clearance. Floor/pick/access settings are game assumptions.
