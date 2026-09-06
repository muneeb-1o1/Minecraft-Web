import * as THREE from 'three';
import { Block, ItemId, ITEM_DEFS, BLOCK_DEFS } from '../world/BlockTypes';
import { Inventory } from '../gameplay/Inventory';
import { TextureAtlas } from '../textures/TextureAtlas';

export class PlayerModel {
  public group: THREE.Group;
  public atlas: TextureAtlas;

  // Body parts
  public headGroup: THREE.Group;
  public headMesh: THREE.Mesh;
  public torsoGroup: THREE.Group;
  public torsoMesh: THREE.Mesh;
  public leftArmGroup: THREE.Group;
  public leftArmMesh: THREE.Mesh;
  public rightArmGroup: THREE.Group;
  public rightArmMesh: THREE.Mesh;
  public leftLegGroup: THREE.Group;
  public leftLegMesh: THREE.Mesh;
  public rightLegGroup: THREE.Group;
  public rightLegMesh: THREE.Mesh;

  // Hand attachment for held item in 3rd person
  public handAttachment: THREE.Group;
  public heldItemMesh: THREE.Object3D | null = null;
  private currentHeldId: number = 0;

  // 3D Armor meshes
  public helmetMesh: THREE.Mesh;
  public chestplateMesh: THREE.Mesh;
  public leftPauldronMesh: THREE.Mesh;
  public rightPauldronMesh: THREE.Mesh;
  public leftLeggingMesh: THREE.Mesh;
  public rightLeggingMesh: THREE.Mesh;
  public leftBootMesh: THREE.Mesh;
  public rightBootMesh: THREE.Mesh;

  // Materials
  private skinMaterial: THREE.MeshStandardMaterial;
  private hairMaterial: THREE.MeshStandardMaterial;
  private shirtMaterial: THREE.MeshStandardMaterial;
  private pantsMaterial: THREE.MeshStandardMaterial;
  private shoesMaterial: THREE.MeshStandardMaterial;
  private ironArmorMaterial: THREE.MeshStandardMaterial;
  private diamondArmorMaterial: THREE.MeshStandardMaterial;

  // Animation state
  private walkTimer: number = 0;

  constructor(atlas: TextureAtlas) {
    this.atlas = atlas;
    this.group = new THREE.Group();
    this.group.name = 'Steve3DModel';

    // Base humanoid materials
    this.skinMaterial = new THREE.MeshStandardMaterial({ color: 0xc68966, roughness: 0.8 });
    this.hairMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.9 });
    this.shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x009ea0, roughness: 0.7 }); // Steve cyan t-shirt
    this.pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3f75, roughness: 0.7 }); // Blue jeans
    this.shoesMaterial = new THREE.MeshStandardMaterial({ color: 0x4f4f4f, roughness: 0.8 }); // Gray shoes

    // Authentic Armor materials
    this.ironArmorMaterial = new THREE.MeshStandardMaterial({
      color: 0xdcdde1,
      roughness: 0.25,
      metalness: 0.85
    });
    this.diamondArmorMaterial = new THREE.MeshStandardMaterial({
      color: 0x00d2d3,
      roughness: 0.15,
      metalness: 0.65,
      emissive: 0x004444,
      emissiveIntensity: 0.25
    });

    // 1. Torso (8x12x4 px -> 0.5 x 0.75 x 0.25)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.75, 0); // Center of torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    this.torsoMesh = new THREE.Mesh(torsoGeo, this.shirtMaterial);
    this.torsoMesh.position.set(0, 0.375, 0);
    this.torsoGroup.add(this.torsoMesh);
    this.group.add(this.torsoGroup);

    // Armor Chestplate
    const chestGeo = new THREE.BoxGeometry(0.54, 0.79, 0.29);
    this.chestplateMesh = new THREE.Mesh(chestGeo, this.ironArmorMaterial);
    this.chestplateMesh.position.set(0, 0.375, 0);
    this.chestplateMesh.visible = false;
    this.torsoGroup.add(this.chestplateMesh);

    // 2. Head (8x8x8 px -> 0.5 x 0.5 x 0.5) with pivot at neck (y = 0.75 from torso base)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.75, 0); // At top of torso
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

    // Multi-material face: front face has Steve eyes, nose, mouth
    const headMaterials = this.createHeadMaterials();
    this.headMesh = new THREE.Mesh(headGeo, headMaterials);
    this.headMesh.position.set(0, 0.25, 0);
    this.headGroup.add(this.headMesh);
    this.torsoGroup.add(this.headGroup);

    // Armor Helmet
    const helmetGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    this.helmetMesh = new THREE.Mesh(helmetGeo, this.ironArmorMaterial);
    this.helmetMesh.position.set(0, 0.27, 0);
    this.helmetMesh.visible = false;
    this.headGroup.add(this.helmetMesh);

    // 3. Right Arm (4x12x4 px -> 0.25 x 0.75 x 0.25) pivot at shoulder
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.375, 0.75, 0);
    const armGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    this.rightArmMesh = new THREE.Mesh(armGeo, this.skinMaterial);
    this.rightArmMesh.position.set(0, -0.375, 0);
    this.rightArmGroup.add(this.rightArmMesh);

    // Right sleeve
    const sleeveGeo = new THREE.BoxGeometry(0.27, 0.28, 0.27);
    const rightSleeve = new THREE.Mesh(sleeveGeo, this.shirtMaterial);
    rightSleeve.position.set(0, -0.14, 0);
    this.rightArmGroup.add(rightSleeve);

    // Right Armor Pauldron
    const pauldronGeo = new THREE.BoxGeometry(0.29, 0.32, 0.29);
    this.rightPauldronMesh = new THREE.Mesh(pauldronGeo, this.ironArmorMaterial);
    this.rightPauldronMesh.position.set(0, -0.14, 0);
    this.rightPauldronMesh.visible = false;
    this.rightArmGroup.add(this.rightPauldronMesh);

    // Hand item attachment point at lower hand
    this.handAttachment = new THREE.Group();
    this.handAttachment.position.set(0, -0.65, -0.05);
    this.rightArmGroup.add(this.handAttachment);

    this.torsoGroup.add(this.rightArmGroup);

    // 4. Left Arm
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.375, 0.75, 0);
    this.leftArmMesh = new THREE.Mesh(armGeo, this.skinMaterial);
    this.leftArmMesh.position.set(0, -0.375, 0);
    this.leftArmGroup.add(this.leftArmMesh);

    // Left sleeve
    const leftSleeve = new THREE.Mesh(sleeveGeo, this.shirtMaterial);
    leftSleeve.position.set(0, -0.14, 0);
    this.leftArmGroup.add(leftSleeve);

    // Left Armor Pauldron
    this.leftPauldronMesh = new THREE.Mesh(pauldronGeo, this.ironArmorMaterial);
    this.leftPauldronMesh.position.set(0, -0.14, 0);
    this.leftPauldronMesh.visible = false;
    this.leftArmGroup.add(this.leftPauldronMesh);

    this.torsoGroup.add(this.leftArmGroup);

    // 5. Right Leg (4x12x4 px -> 0.25 x 0.75 x 0.25) pivot at hip
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.125, 0.75, 0);
    const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    this.rightLegMesh = new THREE.Mesh(legGeo, this.pantsMaterial);
    this.rightLegMesh.position.set(0, -0.375, 0);
    this.rightLegGroup.add(this.rightLegMesh);

    // Right Shoe
    const shoeGeo = new THREE.BoxGeometry(0.26, 0.2, 0.26);
    const rightShoe = new THREE.Mesh(shoeGeo, this.shoesMaterial);
    rightShoe.position.set(0, -0.65, 0);
    this.rightLegGroup.add(rightShoe);

    // Right Legging armor
    const leggingGeo = new THREE.BoxGeometry(0.28, 0.5, 0.28);
    this.rightLeggingMesh = new THREE.Mesh(leggingGeo, this.ironArmorMaterial);
    this.rightLeggingMesh.position.set(0, -0.25, 0);
    this.rightLeggingMesh.visible = false;
    this.rightLegGroup.add(this.rightLeggingMesh);

    // Right Boot armor
    const bootGeo = new THREE.BoxGeometry(0.29, 0.26, 0.29);
    this.rightBootMesh = new THREE.Mesh(bootGeo, this.ironArmorMaterial);
    this.rightBootMesh.position.set(0, -0.62, 0);
    this.rightBootMesh.visible = false;
    this.rightLegGroup.add(this.rightBootMesh);

    this.group.add(this.rightLegGroup);

    // 6. Left Leg
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.125, 0.75, 0);
    this.leftLegMesh = new THREE.Mesh(legGeo, this.pantsMaterial);
    this.leftLegMesh.position.set(0, -0.375, 0);
    this.leftLegGroup.add(this.leftLegMesh);

    // Left Shoe
    const leftShoe = new THREE.Mesh(shoeGeo, this.shoesMaterial);
    leftShoe.position.set(0, -0.65, 0);
    this.leftLegGroup.add(leftShoe);

    // Left Legging armor
    this.leftLeggingMesh = new THREE.Mesh(leggingGeo, this.ironArmorMaterial);
    this.leftLeggingMesh.position.set(0, -0.25, 0);
    this.leftLeggingMesh.visible = false;
    this.leftLegGroup.add(this.leftLeggingMesh);

    // Left Boot armor
    this.leftBootMesh = new THREE.Mesh(bootGeo, this.ironArmorMaterial);
    this.leftBootMesh.position.set(0, -0.62, 0);
    this.leftBootMesh.visible = false;
    this.leftLegGroup.add(this.leftBootMesh);

    this.group.add(this.leftLegGroup);

    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
      }
    });
  }

  // Create pixel-art canvas materials for Steve's face and hair
  private createHeadMaterials(): THREE.Material[] {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Skin base
    ctx.fillStyle = '#c68966';
    ctx.fillRect(0, 0, 16, 16);

    // Hair top & bangs
    ctx.fillStyle = '#4a2a18';
    ctx.fillRect(0, 0, 16, 5);
    ctx.fillRect(0, 5, 3, 3);
    ctx.fillRect(13, 5, 3, 3);

    // Eyes: white sclera + cyan blue pupils
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 7, 3, 2);
    ctx.fillRect(10, 7, 3, 2);

    ctx.fillStyle = '#3c63ac'; // Steve blue eyes
    ctx.fillRect(4, 7, 2, 2);
    ctx.fillRect(10, 7, 2, 2);

    // Nose
    ctx.fillStyle = '#a66a49';
    ctx.fillRect(7, 9, 2, 2);

    // Mouth
    ctx.fillStyle = '#6b3c22';
    ctx.fillRect(5, 12, 6, 2);

    const faceTexture = new THREE.CanvasTexture(canvas);
    faceTexture.magFilter = THREE.NearestFilter;
    faceTexture.minFilter = THREE.NearestFilter;

    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.8 });
    const hairMat = this.hairMaterial;
    const skinMat = this.skinMaterial;

    // Box faces: [PX, NX, PY, NY, PZ, NZ] -> [Right, Left, Top, Bottom, Back, Front]
    return [skinMat, skinMat, hairMat, skinMat, hairMat, faceMat];
  }

  // Update animations, limb swings, head pitch/yaw, and postures
  public update(
    dt: number,
    pitch: number,
    yaw: number,
    isMoving: boolean,
    isSprinting: boolean,
    isSneaking: boolean,
    isSwinging: boolean,
    swingProgress: number,
    isChargingBow: boolean,
    bowCharge: number
  ) {
    // 1. Head tracks pitch and yaw relative to torso body orientation
    this.headGroup.rotation.x = pitch;
    // Steve turns his head to look in camera/look direction up to ~65 degrees
    let headYawOffset = yaw;
    while (headYawOffset < -Math.PI) headYawOffset += Math.PI * 2;
    while (headYawOffset > Math.PI) headYawOffset -= Math.PI * 2;
    this.headGroup.rotation.y = THREE.MathUtils.clamp(headYawOffset, -1.15, 1.15);

    // 2. Walk cycle
    const walkSpeed = isSprinting ? 14 : (isSneaking ? 5 : 9);
    if (isMoving) {
      this.walkTimer += dt * walkSpeed;
    } else {
      // Return smoothly to idle
      this.walkTimer = THREE.MathUtils.lerp(this.walkTimer, 0, 8 * dt);
    }

    const walkAmp = isMoving ? (isSprinting ? 0.85 : 0.6) : 0;
    const armSwing = Math.sin(this.walkTimer) * walkAmp;
    const legSwing = Math.sin(this.walkTimer) * walkAmp;

    // Legs alternate swing
    this.leftLegGroup.rotation.x = -legSwing;
    this.rightLegGroup.rotation.x = legSwing;

    // Arms alternate swing in opposition to legs
    this.leftArmGroup.rotation.x = legSwing;
    this.rightArmGroup.rotation.x = -legSwing;
    this.leftArmGroup.rotation.z = -0.05;
    this.rightArmGroup.rotation.z = 0.05;

    // 3. Sneaking posture
    if (isSneaking) {
      this.torsoGroup.position.y = 0.62; // Lower body
      this.torsoGroup.rotation.x = 0.35; // Tilt forward
      this.headGroup.rotation.x = pitch - 0.35; // Compensate head look
      this.rightLegGroup.position.y = 0.62;
      this.leftLegGroup.position.y = 0.62;
    } else {
      this.torsoGroup.position.y = 0.75;
      this.torsoGroup.rotation.x = 0;
      this.rightLegGroup.position.y = 0.75;
      this.leftLegGroup.position.y = 0.75;
    }

    // 4. Bow charging posture
    if (isChargingBow) {
      // Left arm points forward aiming
      this.leftArmGroup.rotation.x = -1.4 + pitch * 0.7;
      this.leftArmGroup.rotation.y = 0.25;
      this.leftArmGroup.rotation.z = 0.1;

      // Right arm draws bowstring back to chest
      const drawBack = Math.min(1.0, bowCharge);
      this.rightArmGroup.rotation.x = -1.25 + pitch * 0.7;
      this.rightArmGroup.rotation.y = -0.45 * drawBack;
      this.rightArmGroup.rotation.z = -0.15;
    }
    // 5. Mining/Attacking swing animation
    else if (isSwinging) {
      const swingAngle = Math.sin(swingProgress * Math.PI);
      this.rightArmGroup.rotation.x = -swingAngle * 1.6 - 0.15;
      this.rightArmGroup.rotation.y = -swingAngle * 0.4;
      this.rightArmGroup.rotation.z = swingAngle * 0.25;
    }
  }

  // Update equipped armor pieces
  public updateArmor(inventory?: Inventory) {
    if (!inventory) {
      this.setArmorVisible(false, false, false, false);
      return;
    }

    const helmet = inventory.getArmorSlot(0);
    const chestplate = inventory.getArmorSlot(1);
    const leggings = inventory.getArmorSlot(2);
    const boots = inventory.getArmorSlot(3);

    // Helmet
    if (helmet) {
      this.helmetMesh.visible = true;
      this.helmetMesh.material = helmet.id === ItemId.DIAMOND_HELMET ? this.diamondArmorMaterial : this.ironArmorMaterial;
    } else {
      this.helmetMesh.visible = false;
    }

    // Chestplate & Pauldrons
    if (chestplate) {
      const mat = chestplate.id === ItemId.DIAMOND_CHESTPLATE ? this.diamondArmorMaterial : this.ironArmorMaterial;
      this.chestplateMesh.visible = true;
      this.chestplateMesh.material = mat;
      this.leftPauldronMesh.visible = true;
      this.leftPauldronMesh.material = mat;
      this.rightPauldronMesh.visible = true;
      this.rightPauldronMesh.material = mat;
    } else {
      this.chestplateMesh.visible = false;
      this.leftPauldronMesh.visible = false;
      this.rightPauldronMesh.visible = false;
    }

    // Leggings
    if (leggings) {
      const mat = leggings.id === ItemId.DIAMOND_LEGGINGS ? this.diamondArmorMaterial : this.ironArmorMaterial;
      this.leftLeggingMesh.visible = true;
      this.leftLeggingMesh.material = mat;
      this.rightLeggingMesh.visible = true;
      this.rightLeggingMesh.material = mat;
    } else {
      this.leftLeggingMesh.visible = false;
      this.rightLeggingMesh.visible = false;
    }

    // Boots
    if (boots) {
      const mat = boots.id === ItemId.DIAMOND_BOOTS ? this.diamondArmorMaterial : this.ironArmorMaterial;
      this.leftBootMesh.visible = true;
      this.leftBootMesh.material = mat;
      this.rightBootMesh.visible = true;
      this.rightBootMesh.material = mat;
    } else {
      this.leftBootMesh.visible = false;
      this.rightBootMesh.visible = false;
    }
  }

  private setArmorVisible(h: boolean, c: boolean, l: boolean, b: boolean) {
    this.helmetMesh.visible = h;
    this.chestplateMesh.visible = c;
    this.leftPauldronMesh.visible = c;
    this.rightPauldronMesh.visible = c;
    this.leftLeggingMesh.visible = l;
    this.rightLeggingMesh.visible = l;
    this.leftBootMesh.visible = b;
    this.rightBootMesh.visible = b;
  }

  // Update held item in hand (sword, pickaxe, axe, shovel, bow, block)
  public updateHeldItem(heldItemId: number) {
    if (this.currentHeldId === heldItemId && this.heldItemMesh) return;
    this.currentHeldId = heldItemId;

    if (this.heldItemMesh) {
      this.handAttachment.remove(this.heldItemMesh);
      this.heldItemMesh = null;
    }

    if (heldItemId === 0) return;

    if (heldItemId === ItemId.BOW) {
      const bow = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 0.8 });
      const stave = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), woodMat);
      bow.add(stave);
      bow.position.set(0, -0.05, -0.15);
      bow.rotation.set(Math.PI / 4, 0, 0);
      this.handAttachment.add(bow);
      this.heldItemMesh = bow;
    } else if (ITEM_DEFS[heldItemId]?.toolType) {
      // 3D Tool mesh (pickaxe, sword, axe, shovel)
      const tool = new THREE.Group();
      const def = ITEM_DEFS[heldItemId];
      const tierCol = def.toolTier === 4 ? 0x00d2d3 : (def.toolTier === 3 ? 0xdcdde1 : (def.toolTier === 2 ? 0x7f8c8d : 0x8b5a2b));

      // Handle stick
      const stickMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 0.8 });
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), stickMat);
      tool.add(stick);

      // Tool Head
      const headMat = new THREE.MeshStandardMaterial({ color: tierCol, roughness: 0.3, metalness: def.toolTier === 3 || def.toolTier === 4 ? 0.7 : 0 });
      if (def.toolType === 'sword') {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.03), headMat);
        blade.position.set(0, 0.35, 0);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), stickMat);
        guard.position.set(0, 0.12, 0);
        tool.add(blade);
        tool.add(guard);
      } else {
        const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), headMat);
        pickHead.position.set(0, 0.22, 0);
        tool.add(pickHead);
      }

      tool.position.set(0, -0.1, -0.2);
      tool.rotation.set(Math.PI / 3, 0, 0);
      this.handAttachment.add(tool);
      this.heldItemMesh = tool;
    } else if (BLOCK_DEFS[heldItemId]) {
      // Mini voxel block
      const blockGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
      const blockMesh = new THREE.Mesh(blockGeo, new THREE.MeshStandardMaterial({ map: this.atlas.texture }));
      blockMesh.position.set(0, -0.1, -0.15);
      blockMesh.rotation.set(0.3, 0.5, 0);
      this.handAttachment.add(blockMesh);
      this.heldItemMesh = blockMesh;
    }
  }

  public dispose() {
    this.skinMaterial.dispose();
    this.hairMaterial.dispose();
    this.shirtMaterial.dispose();
    this.pantsMaterial.dispose();
    this.shoesMaterial.dispose();
    this.ironArmorMaterial.dispose();
    this.diamondArmorMaterial.dispose();
  }
}
