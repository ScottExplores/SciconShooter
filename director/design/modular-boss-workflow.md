# Modular boss artwork workflow

This workflow exists because a flattened boss illustration and a separately generated “parts sheet” are not interchangeable. If those two images are invented independently, their proportions, joints, lighting, and attachment geometry drift. Reassembling the unrelated sheet then produces floating limbs, duplicate weapons, bad layers, or a hollow center.

The authoritative gameplay visual must be the assembled modular rig.

## 1. Lock the design

Write a design contract before final art generation. Lock the silhouette, view, authored size, pixel density, palette, outlines, lighting, materials, anatomy, movable joints, weapons, effects, attacks, and phase change.

One flattened concept is allowed as a reference guide. Keep it out of the runtime registration.

## 2. Generate component families

Use the locked concept as a reference for every family. Generate body, appendage, weapon, and effect families separately on a flat chroma background. Preserve the same scale, perspective, joint collars, pixel density, palette, outlines, and light direction.

Each animated family uses a fixed grid and fixed registration. Reject a family when:

- a weapon or pod is painted into an arm that must move independently;
- mirrored parts change scale or perspective;
- attachment collars do not meet;
- a frame jumps at its pivot;
- the design changes identity.

Keep named, transparent source PNGs. Physical sprites use binary alpha; translucent pixels are reserved for effects.

## 3. Pack, never guess

The source-layout manifest names every occupied grid cell. The packer extracts those exact cells, writes individual named PNGs, normalizes animation registration, and deterministically packs the runtime atlas and JSON.

Do not discover part identity by sorting anonymous connected components. Do not enter approximate runtime crop rectangles by hand.

## 4. Build the hierarchy

The rig manifest owns:

- a unique part ID and atlas frame;
- parent part;
- neutral local transform;
- pivot/anchor;
- layer;
- optional frame animation;
- weapon and effect sockets.

The boss root moves through the arena. Shoulders move arms, arms move mounted cannons, and cannons move muzzle sockets. A pure transform resolver is shared by presentation and any socket-driven behavior so the two cannot disagree.

## 5. Validate the neutral pose

Before authoring attacks, render a neutral preview from the actual modular rig. Confirm:

- one dominant connected silhouette;
- no floating or duplicated parts;
- no accidental empty center;
- believable joint overlap;
- correct front/back order;
- weapons physically mounted to the anatomy;
- stable animation registration.

Selection thumbnails are exported from this validated assembly. The concept image is never substituted to hide a broken rig.

## 6. Animate with mechanical cause

Use transforms for rigid motion: hovering, shoulder/elbow movement, aiming, recoil, armor movement, and stabilizer gait.

Use frames when appearance changes: a reactor opening, a barrel cycling, a muzzle flash, a flame loop, or damage sparks.

Timeline state drives secondary motion. Parts must not move randomly. Telegraph, mechanism movement, effect, projectile, recoil, recovery, and return-to-neutral form one attack sentence.

## 7. Design attacks from anatomy

Each damaging attack must name a valid weapon/core socket and have a linked warning. Prefer three distinct lessons:

1. an articulated weapon attack;
2. a central reactor or eye pattern;
3. a pod, limb, blade, summon, or movement attack.

Phase two changes silhouette or weapon vocabulary rather than multiplying every speed. Validate projectile/entity budgets and a phone-safe route.

## 8. Test and ship the sandbox package

Use the existing Boss Sandbox controls for restart, pause, time scale, viewport, phase jump, and individual numbered attacks. Exercise every joint, frame group, socket, warning, attack, recovery, phase transition, and death at desktop and phone sizes.

The local Boss Sandbox and private mobile Runner compile from the same prototype definition and rig registration. Publish only the derived neutral preview and runtime atlas to the private Runner. Concepts, editable source components, and provenance remain local.

The prototype stays sandbox-only and must be named in the production-exclusion gate.

