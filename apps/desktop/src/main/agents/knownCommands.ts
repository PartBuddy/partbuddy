/**
 * The command groups (the id up to its first dot) the assistant may use, from the catalogue of
 * SolidCraft 0.40.1 (`solidcraft-cli commands`, 634 commands): modelling, inspecting and the
 * history. A group that is not listed, one a later SolidCraft adds among them, is refused until
 * someone has looked at it (audit H-30, S-31), and so is a command of a listed group that is not in
 * {@link KNOWN_COMMANDS} (audit S-03, BC-26). Of the raw modelling commands, those PartBuddy builds
 * itself are refused (policy.ts `CHECKED_WAYS`); the others are checked after each change (audit S-03, S-17).
 * Kept here, free of imports, so the contract test can read them without the app's packages.
 */
export const COMMAND_GROUPS = new Set([
  'appearance', 'assembly', 'body', 'browser', 'canvas', 'component', 'construct', 'contact', 'explode', 'expr', 'face',
  'frame', 'inspect', 'joint', 'mesh', 'model', 'motion', 'note', 'occurrence', 'parameters', 'parts', 'plastic', 'sheet',
  'sketch', 'solid', 'surface', 'timeline',
]);

/** Single commands of a group that is not listed: undo and redo, and the saved views `screenshot {view}` shows. */
export const GROUP_EXCEPTIONS = new Set(['edit.undo', 'edit.redo', 'view.save', 'view.apply', 'view.list']);

/**
 * The engine commands PartBuddy has looked at (audit S-03, BC-26): every command of SolidCraft's catalogue
 * (`solidcraft-cli commands`, read on 2026-11-14) in the groups the policy allows, and the single commands it allows
 * from other groups ({@link COMMAND_GROUPS}, {@link GROUP_EXCEPTIONS}). The union of 0.40.1 (634 commands, the
 * minimum version) and 0.41.0 (642). Comparing the two catalogues, 0.41.0 adds three ids in these groups (model.mesh,
 * sketch.spline.handles, sketch.spline.reset_handles) and removes none; ids such as assembly.constraint.edit, missing
 * in 0.40.0-rc.4, are already in 0.40.1.
 * A command a later SolidCraft adds to one of those groups is refused until someone has looked at it and added it
 * here; the contract test "knows every command of the allowed groups" names it. Which of these are refused is
 * policy.ts's business.
 */
export const KNOWN_COMMANDS_VERSION = '0.41.0';

export const KNOWN_COMMANDS: ReadonlySet<string> = new Set(
  `
appearance.assign appearance.chain appearance.copy appearance.favorite appearance.library appearance.list appearance.paint
appearance.paste appearance.pick_up appearance.replace
assembly.bom assembly.constraint.create assembly.constraint.edit assembly.mass_properties
body.print_face body.rename body.repair
browser.collapse_all browser.expand_all browser.group browser.move browser.order browser.rename_group browser.reparent
browser.ungroup browser.visibility
canvas.calibrate canvas.decal canvas.delete canvas.edit canvas.insert canvas.straighten canvas.to_sketch
component.activate component.break_link component.capture_position component.copies component.copy_bodies component.create
component.cycle_color component.delete component.edit_in_place component.extract component.finish_edit component.from_bodies
component.hide_history component.insert_design component.links component.list component.metadata component.metadata.set
component.move_bodies component.move_features component.move_sketches component.move_sketches.to_parts component.paste_from_design
component.paste_new component.properties component.relink component.rename component.replace_with_link component.revert_position
component.show_history component.unlock component.update_links
construct.axis construct.axis.edge construct.axis.normal_to_face construct.axis.through_cylinder construct.axis.two_planes
construct.axis.two_points construct.plane construct.plane.along_path construct.plane.at_angle construct.plane.axis_point
construct.plane.midplane construct.plane.offset construct.plane.perpendicular construct.plane.tangent construct.plane.three_points
construct.plane.two_edges construct.point construct.point.along_path construct.point.center construct.point.edge_plane
construct.point.three_planes construct.point.two_edges construct.point.vertex
contact.check contact.create contact.disable_all contact.edit contact.enable_all contact.enable_sets contact.list
edit.redo edit.undo
explode.create explode.delete explode.list explode.show
expr.evaluate
face.delete
frame.end_cap frame.member frame.profile.insert frame.profile.list frame.profile.properties
inspect.accessibility inspect.analysis inspect.center_of_mass inspect.clearance inspect.colored_components inspect.compare
inspect.compare_picture inspect.continuity inspect.curvature_comb inspect.curvature_map inspect.draft inspect.environment_map
inspect.interference inspect.isocurve inspect.measure inspect.minimum_radius inspect.parameter_sweep inspect.parameter_variants
inspect.section inspect.silhouette inspect.zebra
joint.as_built joint.cam joint.create joint.delete joint.drive joint.edit joint.find_limits joint.gear joint.inspect joint.limits
joint.list joint.motion_link joint.origin joint.rack_pinion joint.reach joint.rigid_group joint.screw joint.solve joint.sweep
mesh.convert
model.body_features model.edges model.faces model.mesh model.threads
motion.delete motion.export motion.export_animation motion.interference motion.list motion.play motion.plot motion.study
motion.trace motion.trace.edit motion.trace.keep
note.add note.delete note.list note.update
occurrence.align occurrence.copy occurrence.drag occurrence.ground occurrence.move occurrence.properties occurrence.reparent
parameters.add parameters.change parameters.comment parameters.complete parameters.delete parameters.export parameters.favorite
parameters.graph parameters.import parameters.list parameters.move parameters.rename parameters.users
parts.fastener parts.insert parts.library parts.resize
plastic.assign_rule plastic.boss plastic.lip plastic.manage_rules plastic.rest plastic.rules plastic.snap_fit
sheet.convert sheet.export_bend_table sheet.export_dxf sheet.flange sheet.flat_pattern sheet.fold sheet.hem sheet.manage_rules
sheet.path_flange sheet.perforate sheet.refold sheet.rules sheet.unfold
sketch.arc.center_point sketch.arc.tangent sketch.arc.three_point sketch.arc3d sketch.auto_constrain
sketch.auto_constrain_from_datum sketch.auto_project sketch.blend_curve sketch.break sketch.break_link sketch.cancel
sketch.centerline sketch.chain sketch.chamfer.distance_angle sketch.chamfer.equal_distance sketch.chamfer.two_distance
sketch.circle.center sketch.circle.three_point sketch.circle.three_tangent sketch.circle.two_point sketch.circle.two_tangent
sketch.conic sketch.constrainer sketch.constraint.coincident sketch.constraint.collinear sketch.constraint.concentric
sketch.constraint.curvature sketch.constraint.equal sketch.constraint.fix sketch.constraint.horizontal_vertical
sketch.constraint.midpoint sketch.constraint.parallel sketch.constraint.perpendicular sketch.constraint.polygon
sketch.constraint.symmetry sketch.constraint.tangent sketch.construction sketch.construction_line sketch.construction_line.angle
sketch.construction_line.bisector sketch.construction_line.horizontal sketch.construction_line.parallel
sketch.construction_line.perpendicular sketch.construction_line.tangent_at sketch.construction_line.tangent_external
sketch.construction_line.tangent_two sketch.construction_line.vertical sketch.copy sketch.create sketch.cut sketch.delete
sketch.dimension sketch.dimension_text sketch.drag sketch.drag_end sketch.draw.dimensioned sketch.drawing_bounds sketch.edit
sketch.edit_text sketch.ellipse sketch.equation_curve sketch.equation_curve.edit sketch.export_dxf sketch.extend sketch.fillet
sketch.finish sketch.finish_auto_constrain sketch.fit_curves_to_section sketch.glyphs sketch.include_3d sketch.infinite
sketch.insert_dxf sketch.insert_svg sketch.inspect sketch.intersect sketch.intersection_curve sketch.isoparametric_curve
sketch.line sketch.line.midpoint sketch.line3d sketch.loose_ends sketch.loose_ends.tie sketch.mirror sketch.move sketch.move3d
sketch.move_point sketch.move_points sketch.offset sketch.offset.break sketch.options sketch.paste sketch.pattern.circular
sketch.pattern.rectangular sketch.point sketch.point.divide sketch.point3d sketch.polygon.circumscribed sketch.polygon.edge
sketch.polygon.inscribed sketch.project sketch.project_to_surface sketch.rectangle.center sketch.rectangle.rounded
sketch.rectangle.three_point sketch.rectangle.two_point sketch.redefine sketch.replace sketch.scale sketch.slot.arc_center
sketch.slot.arc_three_point sketch.slot.center_point sketch.slot.center_to_center sketch.slot.overall sketch.snap sketch.solve
sketch.spline.control_point sketch.spline.control_point_5 sketch.spline.fit_point sketch.spline.handles
sketch.spline.insert_point sketch.spline.remove_point sketch.spline.reset_handles sketch.spline.reverse sketch.spline3d sketch.spun_profile sketch.text sketch.toggle_diameter
sketch.toggle_driven sketch.transform sketch.trim sketch.trim.path
solid.align solid.boundary_fill solid.bounding_solid solid.box solid.chamfer solid.coil solid.combine solid.cone solid.cylinder
solid.draft solid.emboss solid.extrude solid.fillet solid.hole solid.loft solid.mirror solid.move solid.offset_face
solid.pattern.circular solid.pattern.path solid.pattern.rectangular solid.pipe solid.press_pull solid.remove solid.replace_face
solid.revolve solid.rib solid.scale solid.shell solid.sphere solid.split_body solid.split_face solid.sweep solid.thread
solid.torus solid.web
surface.blend surface.boundary surface.extend surface.extrude surface.fair surface.fillet surface.loft surface.match
surface.offset surface.patch surface.reverse_normal surface.revolve surface.ruled surface.stitch surface.sweep surface.thicken
surface.trim surface.unstitch surface.untrim
timeline.add timeline.compute_all timeline.copy timeline.delete timeline.dependents timeline.edit timeline.export_script
timeline.group timeline.inspect timeline.move_many timeline.move_to_group timeline.paste timeline.play timeline.redefine
timeline.rename timeline.rename_group timeline.reorder timeline.reorder_many timeline.roll_to timeline.rollback timeline.suppress
timeline.ungroup
view.apply view.list view.save
`
    .split(/\s+/)
    .filter(Boolean),
);
