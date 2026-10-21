<?php
// Read-only overview of nodes, eggs and free allocations, for picking test server settings.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Pterodactyl\Models\{Node, Egg, Allocation, Server, User};

foreach (Node::all() as $n) {
    $used = Server::where('node_id', $n->id)->get();
    printf("NODE %d %s fqdn=%s mem=%d disk=%d servers=%d usedmem=%d useddisk=%d\n", $n->id, $n->name, $n->fqdn, $n->memory, $n->disk, $used->count(), $used->sum('memory'), $used->sum('disk'));
    $free = Allocation::where('node_id', $n->id)->whereNull('server_id')->orderBy('port')->get(['id','ip','port']);
    printf("  free allocations: %d first: %s\n", $free->count(), $free->take(8)->map(fn($a)=>"$a->id:$a->ip:$a->port")->implode(', '));
}
foreach (Egg::with('tags')->get() as $e) {
    printf("EGG %d %s tags=[%s] images=%s\n", $e->id, $e->name, $e->tags->pluck('slug')->implode(','), json_encode(array_values($e->docker_images ?? [])));
}
foreach (Server::all(['id','name','uuid','egg_id','node_id','owner_id']) as $s) {
    printf("SERVER %d %s egg=%d node=%d owner=%d\n", $s->id, $s->name, $s->egg_id, $s->node_id, $s->owner_id);
}
$u = User::where('username', 'claude')->first();
printf("CLAUDE user id=%s admin=%s\n", $u?->id, $u?->root_admin ? 'yes':'no');
