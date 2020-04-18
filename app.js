const PLAYER_SIZE = 20;
const BULLET_SIZE = 4;
const GUN_SIZE = 5;
const SPEED_PLAYER = 3;
const SPEED_BULLET = 10;
const BOMB_SIZE = 10;

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res){
    res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

serv.listen(3000);
console.log("server started.");

var SOCKET_LIST = {};

var Entity = function(){
    var self = {
        x:250,
        y:250,
        spdX:0,
        spdY:0,
        id:"",
    }

    self.update = function(){
        self.updatePosition();
    }

    self.updatePosition = function(){
        self.x += self.spdX;
        self.y += self.spdY;
    }

    self.getDistance = function(pt){
        return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
    }

    return self;
}

var Player = function(id){
    var self = Entity();
    self.id = id;
    self.size = PLAYER_SIZE;
    self.color = Math.floor(Math.random() * 255) + ', ' 
                + Math.floor(Math.random() * 255) + ', '
                + Math.floor(Math.random() * 255);
    self.pressingRight = false;
    self.pressingLeft = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingPlaceBomb = false;
    self.mouseAngle = {sin: 0, cos: 0};
    self.mousePosition = {x: 0, y: 0};
    self.maxSpd = SPEED_PLAYER;
    self.gun = Gun(self);
    self.hp = 100;
    self.hpMax = 100;
    self.score = 0;
    self.maxDistanceBullet = 100;
    self.bullet = [];
    self.bomb = [];
    
    var super_update = self.update;
    self.update = function(){
        self.updateSpd();
        super_update();

        if(self.pressingAttack){
            if(self.bullet.length == 0 || self.bullet[self.bullet.length - 1].distance > 400)
                self.shootBullet(self.mouseAngle);
        }

        if(self.pressingPlaceBomb){
            self.placeBomb({x: self.x, y: self.y, id: self.id});
        }

        var distance  = self.getDistance(self.mousePosition);
        self.mouseAngle.cos = (self.y - self.mousePosition.y) / distance;
        self.mouseAngle.sin = (self.x - self.mousePosition.x) / distance;

        self.gun.updateMouse(self.mouseAngle);

        self.removeBullet();
        self.removeBomb();
    }

    self.placeBomb = function(parent){
        
        if(self.bomb.length == 0 || self.getDistance(self.bomb[self.bomb.length - 1]) > PLAYER_SIZE * 3)
            self.bomb.push(Bomb(parent));
        
    }

    self.removeBomb = function(){

        if(self.bomb.length == 0)
            return;

        if(self.bomb[0].toRemove){
            self.bomb.splice(0, 1);
        }
    }

    self.removeBullet = function(){

        if(self.bullet.length == 0)
            return;

        if(self.bullet[0].toRemove){
            self.bullet.splice(0, 1);
        }
    }

    self.shootBullet = function(angle){
         self.bullet.push(Bullet(self,angle));
    }

    self.updateSpd = function(){
        if(self.pressingRight)
            self.spdX = self.maxSpd;
        else if(self.pressingLeft)
            self.spdX = -self.maxSpd;
        else
            self.spdX = 0;
       
        if(self.pressingUp)
            self.spdY = -self.maxSpd;
        else if(self.pressingDown)
            self.spdY = self.maxSpd;
        else
            self.spdY = 0;     
    }

    self.getInitPack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,  
            size: self.size,
            color: self.color,
            hp:self.hp,
            hpMax:self.hpMax,
            score:self.score,
        };     
    }


    self.getUpdatePack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,
            hp:self.hp,
            score:self.score,
        }  
    }

    Player.list[id] = self;

    initPack.player.push(self.getInitPack());
    return self;
}

Player.list = {};

Player.onConnect = function(socket){
    var player = Player(socket.id);
    socket.on('keyPress',function(data){
        if(data.inputId === 'left')
            player.pressingLeft = data.state;
        else if(data.inputId === 'right')
            player.pressingRight = data.state;
        else if(data.inputId === 'up')
            player.pressingUp = data.state;
        else if(data.inputId === 'down')
            player.pressingDown = data.state;
        else if(data.inputId === 'mouseAngle')
            player.mousePosition = data.state;     
        else if(data.inputId === 'placeBomb')
            player.pressingPlaceBomb = data.state; 
            
    });

    socket.on('mouseDown', function(data){
        player.pressingAttack = data.state; 
    });

    socket.on('mouseUp', function(data){
        player.pressingAttack = data.state; 
    });

    socket.emit('init',{
        player:Player.getAllInitPack(),
        bullet:Bullet.getAllInitPack(),
        gun:Gun.getAllInitPack(),
        bomb: Bomb.getAllInitPack(),
    });
}

Player.getAllInitPack = function(){
    var players = [];
    for(var i in Player.list)
        players.push(Player.list[i].getInitPack());
    return players;
}

Player.onDisconnect = function(socket){
    delete Player.list[socket.id];
    removePack.player.push(socket.id);

    delete Gun.list[socket.id];
    removePack.gun.push(socket.id);
}

Player.update = function(){
    var pack = [];
    for(var i in Player.list){
        var player = Player.list[i];
        player.update();
        pack.push(player.getUpdatePack());    
    }
    return pack;
}




var Bullet = function(parent, angle){
    var self = Entity();
    self.id = Math.random();
    self.size = BULLET_SIZE;
    self.speed = SPEED_BULLET;
    self.spdX = -angle.sin * self.speed;
    self.spdY = -angle.cos * self.speed;
    self.parent = parent.id;
    self.x = parent.gun.x;
    self.y = parent.gun.y;
    self.timer = 0;
    self.toRemove = false;
    self.distance = 0;

    var super_update = self.update;
    self.update = function(){
        if(self.timer++ > parent.maxDistanceBullet)
            self.toRemove = true;
        super_update();

        self.distance += self.speed;
        for(var i in Player.list){
            var p = Player.list[i];
            // if(self.getDistance(p) < 32 && self.parent !== p.id){
            //     //handle collision. ex: hp--;

            //     p.hp -= 5;
                               
            //     if(p.hp <= 0){
            //         var shooter = Player.list[self.parent];
            //         if(shooter)
            //             shooter.score += 1;
            //         p.hp = p.hpMax;
            //         p.x = Math.random() * 500;
            //         p.y = Math.random() * 500;                 
            //     }

            //     self.toRemove = true;
            // }
        }
    }

    self.getInitPack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }

    self.getUpdatePack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }

    Bullet.list[self.id] = self;
    initPack.bullet.push(self.getInitPack());

    return self;
}

Bullet.list = {};

Bullet.update = function(){
    var pack = [];
    for(var i in Bullet.list){
        var bullet = Bullet.list[i];
        bullet.update();
        if(bullet.toRemove)
        {
            delete Bullet.list[i];
            removePack.bullet.push(bullet.id);
        }
        else
            pack.push(bullet.getUpdatePack());     
    }
    return pack;
}

Bullet.getAllInitPack = function(){
    var bullets = [];
    for(var i in Bullet.list)
    {
        bullets.push(Bullet.list[i].getInitPack());
    }
        
    return bullets;
}

var Bomb = function(parent){
    var self = Entity();
    self.id = Math.random();
    self.size = BOMB_SIZE;
    self.parent = parent.id;
    self.x = parent.x;
    self.y = parent.y;
    self.timer = 0;
    self.toRemove = false;
    self.bullets = [];
    self.gun = {x: self.x, y: self.y};
    self.maxDistanceBullet = 10;
    
    self.bulletDeg = Math.PI * 2 / 10;
    

    var super_update = self.update;
    self.update = function(){
        if(self.timer++ == 50){
            self.fireBomb();       
        }

        if(self.timer > 50)
            self.toRemove = true;

        super_update();
    }

    self.fireBomb = function(){
        for(let i = 0; i < 10; i++)
        {
            var deg = i * self.bulletDeg;
            angle = {sin: Math.sin(deg), cos: Math.cos(deg)};
            self.bullets.push(Bullet(self, angle));
        }
    }

    self.getInitPack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }

    self.getUpdatePack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }

    Bomb.list[self.id] = self;
    initPack.bomb.push(self.getInitPack());

    return self;
}

Bomb.list = {};


Bomb.update = function(){
    var pack = [];
    for(var i in Bomb.list){
        var bomb = Bomb.list[i];
        bomb.update();
        if(bomb.toRemove)
        {
            delete Bomb.list[i];
            removePack.bomb.push(bomb.id);
        }else
            pack.push(bomb.getUpdatePack());  
    }  
    return pack;
}

Bomb.getAllInitPack = function(){
    var bombs = [];
    for(var i in Bomb.list)
        bombs.push(Bomb.list[i].getInitPack());
    return bombs;
}

var Gun = function(player){
    var self = Entity();
    self.id = player.id;
    self.size = GUN_SIZE;
    self.color = "red";
    self.x = player.x;
    self.y = player.y - PLAYER_SIZE;

    var super_update = self.update;
    self.update = function(){
        self.updateSpd();
        super_update();
    }

    self.updateMouse = function(angle){
        self.x = player.x - (angle.sin * PLAYER_SIZE);
        self.y = player.y - (angle.cos * PLAYER_SIZE);
    }
    
    self.updateSpd = function(){
        if(player.pressingRight)
            self.spdX = player.maxSpd;
        else if(player.pressingLeft)
            self.spdX = -player.maxSpd;
        else
            self.spdX = 0;
       
        if(player.pressingUp)
            self.spdY = -player.maxSpd;
        else if(player.pressingDown)
            self.spdY = player.maxSpd;
        else
            self.spdY = 0;     
    }

    self.getInitPack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }
    self.getUpdatePack = function(){
        return {
            id:self.id,
            x:self.x,
            y:self.y,      
        };
    }

    Gun.list[self.id] = self;
    initPack.gun.push(self.getInitPack());
    return self;
}

Gun.list = {};

Gun.update = function(){
    var pack = [];
    for(var i in Gun.list){
        var gun = Gun.list[i];
        //gun.update();

        pack.push(gun.getUpdatePack());  
    }  
    return pack;
}

Gun.getAllInitPack = function(){
    var guns = [];
    for(var i in Gun.list)
        guns.push(Gun.list[i].getInitPack());
    return guns;
}

var DEBUG = true;

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
    console.log('socket connection');

    socket.id = Math.random();

    SOCKET_LIST[socket.id] = socket;

    Player.onConnect(socket);
   
    socket.on('disconnect',function(){
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

});

var initPack = {player:[],bullet:[],gun:[], bomb:[]};
var removePack = {player:[],bullet:[],gun:[], bomb:[]};


setInterval(function(){
    var pack = {
        player:Player.update(),
        bullet:Bullet.update(),
        gun:Gun.update(),
        bomb: Bomb.update(),
    }
   
    for(var i in SOCKET_LIST){
        var socket = SOCKET_LIST[i];
        socket.emit('init', initPack);
        socket.emit('update', pack);
        socket.emit('remove', removePack);
    }

    initPack.player = [];
    initPack.bullet = [];
    initPack.gun = [];
    initPack.bomb = [];
    removePack.player = [];
    removePack.bullet = [];
    removePack.gun = [];
    removePack.bomb = [];
   
},1000/60);